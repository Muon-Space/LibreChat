# Fork with minimal changes

This fork implements these PRs:
- feat: Gemini Image Generation Tool (Nano Banana) [#10676](https://github.com/danny-avila/LibreChat/pull/10676)
- feat: Anthropic Vertex AI Support [#10780](https://github.com/danny-avila/LibreChat/pull/10780)
- feat: add hide "base" models flag to model spec [#10915](https://github.com/danny-avila/LibreChat/pull/10915)

This fork implements these custom changes:
- Removed all workflows
  - added just one workflow to build/push the image
    - this is built with more optimization for build speeds
  - updated Dockerfile to mount cache
- Updated README.md
