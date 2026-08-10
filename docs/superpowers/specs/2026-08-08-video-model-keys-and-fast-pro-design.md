# Video Model Keys and Fast/Pro Model Design

## Goal

Configure the six user-supplied WaveSpeed credentials only on the production server and add two selectable image-to-video models: Kling 3.0 Pro and Seedance 2.0 Fast.

## Scope

- Add `seedance-2-fast-image-to-video` to the server model catalogue, client type union, and video-model selector.
- Add `kling-3-pro-image-to-video` to the same surfaces.
- Route each video model to a dedicated environment-variable name.
- Store all six supplied credentials in the systemd drop-in at `/etc/systemd/system/image-workbench.service.d/wavespeed-keys.conf`; do not put them in source, `.env`, task data, logs, or GitHub.
- Preserve the existing four video models and their request shapes.

## Model routing

| UI model | WaveSpeed endpoint | Environment variable |
| --- | --- | --- |
| Kling 3.0 Standard | `kwaivgi/kling-v3.0-std/image-to-video` | `WAVESPEED_KLING_3_STD_I2V_KEY` |
| Kling 3.0 Pro | `kwaivgi/kling-v3.0-pro/image-to-video` | `WAVESPEED_KLING_3_PRO_I2V_KEY` |
| Kling 3.0 Standard Motion Control | `kwaivgi/kling-v3.0-std/motion-control` | `WAVESPEED_KLING_3_STD_MOTION_KEY` |
| Seedance 2.0 Mini | `bytedance/seedance-2.0-mini/image-to-video` | `WAVESPEED_SEEDANCE_2_MINI_KEY` |
| Seedance 2.0 Fast | `bytedance/seedance-2.0-fast/image-to-video` | `WAVESPEED_SEEDANCE_2_FAST_KEY` |
| Seedance 2.0 | `bytedance/seedance-2.0/image-to-video` | `WAVESPEED_SEEDANCE_2_KEY` |

## UX and behavior

- The selector will show Fast as a low-cost/fast image-to-video option and Pro as a premium-quality image-to-video option.
- Both are non-motion image-to-video models, so they use the existing reference image, prompt, duration, aspect-ratio, resolution, and audio controls.
- Existing Kling Standard remains the only model that currently permits an empty prompt.
- Server-side payload generation uses the existing Seedance payload format for Fast and the existing Kling image-to-video payload format for Pro.

## Error handling and verification

- Missing configuration continues to return the existing non-secret missing-key error naming only the variable.
- Add tests proving endpoint selection, payload behavior, and key routing for Fast and Pro.
- Build and run the complete test suite before deployment.
- After the systemd reload/restart, verify the running process contains the six variable names without printing their values, then create no-cost validation requests where supported; do not submit paid video generations without further approval.

## Non-goals

- No new text-to-video, 4K, video-edit, video-extend, or Kling Pro motion-control UI in this change.
- No credential values are committed because this workspace is not a Git repository and the production GitHub repository is public.
