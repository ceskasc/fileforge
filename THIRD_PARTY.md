# Third-party software and model weights

FileForge's AI enhancement uses TensorFlow.js 4.22.0 (Apache-2.0), ESRGAN Slim 2× (RDN, MIT), ESRGAN Medium 2× (RDN, MIT) and ESRGAN Thick 2× (RRDN, MIT), distributed by Kevin Scott through UpscalerJS.

- TensorFlow.js: https://github.com/tensorflow/tfjs/tree/tfjs-v4.22.0
- Model source, immutable revision: https://github.com/thekevinscott/UpscalerJS/tree/6d074fb5835a6c659a19c83123beab8c3f28beac
- Models and licensing: https://upscalerjs.com/models/
- Original ESRGAN research/code: https://github.com/xinntao/ESRGAN (Apache-2.0)

Only the AI runtime and model weights are downloaded. User images are never uploaded to these sources.

The build downloads a pinned TensorFlow npm tarball, verifies its SHA-512 npm integrity, and verifies every pretrained model file against the Git blob SHA recorded in scripts/ai-assets.json. Runtime, weights and licence texts are hosted alongside the site. ai-assets-manifest.json contains resulting SHA-256 checksums.

The original TF.js and model licences are preserved under vendor/tensorflow-LICENSE.txt and models/LICENSE.txt in the published site. FileForge's serialization adapters support the published MultiplyBeta and PixelShuffle2x layers; the trained weights are not modified.

The TensorFlow 4.22.0 browser bundle contains two legacy global-object lookups using the Function constructor. FileForge replaces those exact bootstrap expressions with direct globalThis references so the runtime works with script-src 'self' and string evaluation disabled. The build verifies the unmodified npm tarball before this bounded compatibility transformation. ai-assets-manifest.json records the upstream runtime hash, compatibility revision and served runtime hash. The same transformed runtime is used for CPU model tests and the browser-CSP regression test.

The self-hosted @tensorflow/tfjs-backend-wasm 4.22.0 package is Apache-2.0, matching the TF.js version. Its npm archive is verified against the pinned SHA-512 in scripts/ai-assets.json. The original browser loader and baseline/SIMD/threaded-SIMD binaries are distributed unmodified; the published manifest records each SHA-256. No shared-memory threads are enabled on GitHub Pages. The CSP permits WebAssembly compilation with wasm-unsafe-eval while keeping JavaScript string evaluation forbidden. Native WebGL or WASM computation runs the same selected trained weights; neither replaces AI with a filter.

Photo restoration uses the official RealESRGAN general x4v3 SRVGG weights (BSD-3-Clause), release v0.2.5.0. The source checkpoint is https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth with SHA-256 8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292. Architecture and license revision: https://github.com/xinntao/Real-ESRGAN/tree/685d429c81888252bdb10f56c7754baededc3823. The original BSD notice is preserved as models/restore/LICENSE.txt.

The build verifies the checkpoint before reading its tensor-only metadata with a restricted unpickler (only OrderedDict, FloatStorage descriptors and tensor rebuild descriptors are permitted; no torch module is imported). OIHW kernels are transposed to HWIO; the last convolution's channels and bias are reordered from PyTorch CRD to TensorFlow DCR for native depth-to-space. Learned numeric weights, per-channel PReLU and the nearest-neighbor residual remain intact. Output is clipped to display RGB and Lanczos-downsampled from native 4x to the user's selected 1x/2x. Generated weight files have content-addressed names. The conversion is checked against an independently evaluated NumPy original-layout forward fixture as well as WASM/CPU parity. This restoration model replaces the previous clean-image RDN Photo model.
