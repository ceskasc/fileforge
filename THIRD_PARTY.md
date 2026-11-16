# Third-party software and model weights

FileForge's AI enhancement uses TensorFlow.js 4.22.0 (Apache-2.0), ESRGAN Medium 2× (RDN, MIT) and ESRGAN Thick 2× (RRDN, MIT), distributed by Kevin Scott through UpscalerJS.

- TensorFlow.js: https://github.com/tensorflow/tfjs/tree/tfjs-v4.22.0
- Model source, immutable revision: https://github.com/thekevinscott/UpscalerJS/tree/6d074fb5835a6c659a19c83123beab8c3f28beac
- Models and licensing: https://upscalerjs.com/models/
- Original ESRGAN research/code: https://github.com/xinntao/ESRGAN (Apache-2.0)

Only the AI runtime and model weights are downloaded. User images are never uploaded to these sources.

The build downloads a pinned TensorFlow npm tarball, verifies its SHA-512 npm integrity, and verifies every pretrained model file against the Git blob SHA recorded in scripts/ai-assets.json. Runtime, weights and licence texts are hosted alongside the site. ai-assets-manifest.json contains resulting SHA-256 checksums.

The original TF.js and model licences are preserved under vendor/tensorflow-LICENSE.txt and models/LICENSE.txt in the published site. FileForge's serialization adapters support the published MultiplyBeta and PixelShuffle2x layers; the trained weights are not modified.
