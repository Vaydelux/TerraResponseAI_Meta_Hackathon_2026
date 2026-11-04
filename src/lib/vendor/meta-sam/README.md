Official Meta SAM 3.1 parser sources vendored under this directory.
Source: https://github.com/meta-models/meta-sam/tree/main/typescript/packages/parser/src
License: the SAM License, copied in LICENSE. Copyright (c) Meta Platforms, Inc.
These vendored modules are the upstream parseImageStream and decodeMaskToRaster
implementation, pinned by the GitHub commit history at PR #70; no additional
npm runtime dependencies are introduced. Relative .js import suffixes were
converted to extensionless imports for the Next.js bundler.
Only the parser, stream, error, types and mask codec modules needed for image
segmentation are included; unrelated object prompt/video packages are not.
