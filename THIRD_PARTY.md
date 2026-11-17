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
