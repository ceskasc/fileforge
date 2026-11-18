import collections
import hashlib
import io
import pickle
import sys
import zipfile
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

DIGEST = "49fafd45f8fd7aa8d31ab2a22d14d91b536c34494a5cfe31eb5d89c2fa266abb"


class TensorReader(pickle.Unpickler):
    def find_class(self, module, name):
        if (module, name) == ("collections", "OrderedDict"):
            return collections.OrderedDict
        if (module, name) == ("torch._utils", "_rebuild_tensor_v2"):
            return tensor_descriptor
        if (module, name) == ("torch", "FloatStorage"):
            return "float32"
        raise ValueError(f"Unsupported checkpoint global {module}.{name}")

    def persistent_load(self, tag):
        return tag

def tensor_descriptor(storage, offset, shape, stride, *_):
    return storage, offset, shape, stride

def read_checkpoint(checkpoint):
    with checkpoint.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != DIGEST:
            raise ValueError("Checkpoint SHA-256 mismatch")
    with zipfile.ZipFile(checkpoint) as archive:
        index, = [name for name in archive.namelist() if name.endswith("/data.pkl")]
        prefix = index.removesuffix("data.pkl")
        descriptors = TensorReader(io.BytesIO(archive.read(index))).load()["params_ema"]
        weights = {}
        for name, (storage, offset, shape, stride) in descriptors.items():
            tag, dtype, key, _, count = storage
            if tag != "storage" or dtype != "float32" or offset != 0:
                raise ValueError(f"Invalid tensor storage for {name}")
            data = np.frombuffer(archive.read(prefix + "data/" + key), dtype="<f4").reshape(shape)
            if data.size != count or tuple(s // 4 for s in data.strides) != stride:
                raise ValueError(f"Invalid tensor shape for {name}")
            weights[name] = data
    return weights

def export(checkpoint, destination):
    weights = read_checkpoint(checkpoint)
    nodes = []
    tensors = [numpy_helper.from_array(np.float32(.2), "beta"),
               numpy_helper.from_array(np.array([1, 1, 2, 2], dtype=np.float32), "resize2")]

    def node(op, *inputs, **attrs):
        output = f"y{len(nodes)}"
        nodes.append(helper.make_node(op, inputs, [output], **attrs))
        return output

    def conv(prefix, value, activated=False):
        names = [prefix + ".weight", prefix + ".bias"]
        tensors.extend(numpy_helper.from_array(weights.pop(name), name) for name in names)
        result = node("Conv", value, *names, pads=[1, 1, 1, 1])
        return node("LeakyRelu", result, alpha=.2) if activated else result

    def residual(original, detail):
        return node("Add", original, node("Mul", detail, "beta"))

    # Pixel unshuffle is done outside the model in PyTorch CRD order.
    first = x = conv("conv_first", "pixels")
    for block in range(23):
        block_input = x
        for rdb in range(1, 4):
            block_prefix = f"body.{block}.rdb{rdb}."
            features = [x]
            for layer in range(1, 6):
                joined = features[0] if layer == 1 else node("Concat", *features, axis=1)
                features.append(conv(block_prefix + f"conv{layer}", joined, activated=layer < 5))
            x = residual(x, features[-1])
        x = residual(block_input, x)
    x = node("Add", first, conv("conv_body", x))
    for up in (1, 2):
        enlarged = node("Resize", x, "", "resize2", mode="nearest",
                        coordinate_transformation_mode="asymmetric", nearest_mode="floor")
        x = conv(f"conv_up{up}", enlarged, activated=True)
    x = conv("conv_last", conv("conv_hr", x, activated=True))
    if weights:
        raise ValueError(f"Unexpected unused checkpoint weights: {list(weights)}")
    graph = helper.make_graph(nodes, "RealESRGAN_x2plus",
        [helper.make_tensor_value_info("pixels", TensorProto.FLOAT, [1, 12, "height", "width"])],
        [helper.make_tensor_value_info(x, TensorProto.FLOAT, [1, 3, "output_height", "output_width"])],
        initializer=tensors)
    model = helper.make_model(graph, producer_name="FileForge",
                              opset_imports=[helper.make_opsetid("", 17)], ir_version=9)
    onnx.checker.check_model(model)
    onnx.save_model(model, destination)

if __name__ == "__main__":
    export(Path(sys.argv[1]), Path(sys.argv[2]))
