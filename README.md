# Fork with minimal changes

This fork implements these PRs:
- ~~feat: Gemini Image Generation Tool (Nano Banana) [#10676](https://github.com/danny-avila/LibreChat/pull/10676)~~
  - implemented upstream!
- ~~feat: Anthropic Vertex AI Support [#10780](https://github.com/danny-avila/LibreChat/pull/10780)~~
  - implemented upstream!
- ~~feat: add hide "base" models flag to model spec [#10915](https://github.com/danny-avila/LibreChat/pull/10915)~~
  - rejected, but workaround was provided instead
- [feat: custom oauth token handling](https://github.com/Muon-Space/LibreChat/pull/10)

This fork implements these custom changes:
- Removed all workflows
  - added just one workflow to build/push the image
    - this is built with more optimization for build speeds
- Updated README.md
