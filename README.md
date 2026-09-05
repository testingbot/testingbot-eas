# TestingBot for EAS Workflows

Run [Maestro](https://maestro.mobile.dev/) flows on the [TestingBot](https://testingbot.com) device grid from inside [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/). Documentation: [Maestro tests for Expo / EAS Build](https://testingbot.com/support/app-automate/maestro/ci-cd/expo-eas).

A drop-in alternative to Expo's built-in `maestro-cloud` job type: run your flows on TestingBot's real devices and emulators instead of Maestro Cloud, with no Maestro Cloud account required.

## Quick start

### 1. Store your TestingBot credentials as EAS secrets

Get your key and secret from the [TestingBot dashboard](https://testingbot.com/members/user/edit).

```bash
eas env:create --name TB_KEY --value <your-key> --visibility secret \
  --environment production --environment preview --environment development
eas env:create --name TB_SECRET --value <your-secret> --visibility secret \
  --environment production --environment preview --environment development
```

EAS injects project secrets into the step environment directly. Do **not** reference them with `${{ secrets.TB_KEY }}` — that syntax is not supported in EAS Workflows.

### 2. Add the job to your workflow

```yaml
jobs:
  build_android:
    type: build
    params:
      platform: android
      profile: preview

  e2e_android:
    needs: [build_android]
    runs_on: linux-medium
    outputs:
      console_url: ${{ steps.testingbot.outputs.console_url }}
      run_status: ${{ steps.testingbot.outputs.run_status }}
    steps:
      - uses: eas/checkout
      - uses: eas/download_build
        id: download
        with:
          build_id: ${{ needs.build_android.outputs.build_id }}
      - id: testingbot
        run: |
          npx --yes @testingbot/eas-workflow@v1 \
            --app-file ${{ steps.download.outputs.artifact_path }} \
            --flows ./.maestro \
            --device "Pixel 8" \
            --deviceVersion "14"
```

Complete Android and iOS examples live in [`examples/`](./examples).

## Wrapper options

| Flag                | Required | Description                                                                                                                                       |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--app-file <path>` | one of   | The app under test: `.apk`, `.ipa`, an `.app`/`.zip` simulator build, or an EAS `.tar.gz`. Usually `${{ steps.download.outputs.artifact_path }}`. |
| `--app-url <url>`   | one of   | Download the app instead: an EAS Build artifact URL or any http(s) link to an `.apk`, `.ipa`, `.zip` or `.tar.gz`. Forwarded to the CLI.          |
| `--app-binary-id`   | one of   | Reuse an app uploaded earlier (the `app_id` output of a previous step). Forwarded to the CLI.                                                     |
| `--flows <path>`    | yes      | Maestro flows: a directory, a single `.yaml`/`.yml`, a `.zip`, or a glob. Repeat the flag for multiple paths.                                     |

Every other flag is passed straight through to `testingbot maestro`, so the full CLI surface is available — `--device`, `--deviceVersion`, `--real-device`, `--shard-split`, `--retry`, `--include-tags`, `--report`, `--download-artifacts`, `--async`, `-e KEY=VALUE`, and so on. See the [TestingBot Maestro docs](https://testingbot.com/support/maestro) for the full list.

Device names accept wildcards (`--device ".*Galaxy.*"`), which lets TestingBot allocate any matching device and cuts queue time.

## Environment variables

Set `env` on the **job**, not on a step: EAS can silently ignore step-level `env`. Pull request expressions (`github.event.pull_request.number`, `.html_url`) evaluate to `null` on manual and push triggers and EAS then rejects the job, so only set `TB_GH_PR_NUMBER` / `TB_GH_PR_URL` in workflows triggered by `pull_request`.

> [!WARNING]
> Never name a workflow variable with the `EAS_BUILD_*` prefix. That namespace is reserved by the EAS Build worker, and overwriting `EAS_BUILD_ID` breaks the project-archive refresh — the job then fails silently after the `PREPARE_PROJECT` phase. This wrapper uses the `TB_*` prefix for exactly that reason.

| Variable                                                                     | Purpose                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TB_KEY`, `TB_SECRET`                                                        | **Required.** TestingBot credentials, set as EAS project secrets.                                                                                                |
| `TB_GH_SHA`                                                                  | Recorded as the run's commit SHA (`--commit-sha`).                                                                                                               |
| `TB_GH_PR_NUMBER`                                                            | Recorded as the pull request id (`--pull-request-id`).                                                                                                           |
| `TB_GH_REPO_OWNER`, `TB_GH_REPO_NAME`                                        | Recorded as the repository owner and name. `TB_GH_REPO_NAME` accepts `${{ github.repository }}` (`owner/repo`) and splits it, so the owner variable is optional. |
| `TB_GH_BRANCH`                                                               | Recorded as the run's branch (`--branch`) and prefixes the generated run name.                                                                                   |
| `TB_GH_PR_URL`                                                               | Recorded as the pull request URL (`--pr-url`).                                                                                                                   |
| `TB_EAS_BUILD_ID`, `TB_EAS_PLATFORM`, `TB_EAS_PROFILE`, `TB_EAS_APP_VERSION` | Folded into the run name so the build is identifiable on the TestingBot dashboard.                                                                               |
| `TB_RUN_NAME`                                                                | Sets the run name explicitly, overriding the generated one.                                                                                                      |
| `TB_GROUPS`                                                                  | Comma-separated group tags for the session (`--groups`).                                                                                                         |
| `TB_CLI_VERSION`                                                             | Pins `@testingbot/cli` to a specific version instead of resolving the latest.                                                                                    |
| `TB_USE_BETA`                                                                | Set to `true` to use the `@testingbot/cli` beta release.                                                                                                         |
| `TB_API_URL`                                                                 | Overrides the TestingBot API base URL used to read flow results.                                                                                                 |

## Step outputs

| Output                       | Description                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- |
| `console_url`                | Link to the run on the TestingBot dashboard.                                |
| `app_id`                     | TestingBot project id for the uploaded app.                                 |
| `run_urls`                   | Comma-separated links to each individual run.                               |
| `run_status`                 | `PASSED`, `FAILED`, `STARTED` (async), or `ERROR`.                          |
| `outcome`                    | The CLI's own outcome: `passed`, `failed`, `started`, `dry-run` or `error`. |
| `error`                      | The error message when `run_status` is `ERROR`.                             |
| `total_flows_count`          | Number of flows that reported a result.                                     |
| `successful_flows_count`     | Number of flows that passed.                                                |
| `failed_flows_count`         | Number of flows that failed.                                                |
| `successful_flow_names_json` | JSON array of passing flow names.                                           |
| `failed_flow_names_json`     | JSON array of failing flow names.                                           |
| `summary`                    | One-line result summary, e.g. `1 of 5 flows failed: …`.                     |

The step exits with the CLI's exit codes: `0` when every flow passed (also for `--async` and `--dry-run`), `2` when one or more flows failed, `1` on a CLI or infrastructure error. So the job fails as you would expect, and a pipeline can tell a red test run from a broken upload.

The flow counts come from the results document the CLI writes (`--json-file`, CLI 1.2.0 and newer). Retried flows are counted once, with the last attempt winning, and with `--device-matrix` each device's result is listed separately as `flow (device)`. They are skipped in `--async` mode, since no results exist yet. With a CLI pinned below 1.2.0 via `TB_CLI_VERSION` the wrapper falls back to reading the console output and one status call to the API.

### Reporting results

EAS has no built-in test-report panel, so results reach people through the outputs above. Feed them to a `doc` job to render a summary into the workflow logs, to `github-comment` in payload mode to post on the pull request, or to `slack`:

```yaml
jobs:
  report:
    # `after` rather than `needs`, so the comment is still posted when the
    # e2e job fails — which is exactly when you want it.
    after: [e2e_android]
    type: github-comment
    params:
      payload: |
        ### Maestro on TestingBot
        ${{ after.e2e_android.outputs.summary }}
        [View results](${{ after.e2e_android.outputs.console_url }})
```

EAS step outputs are single-line, so `summary` contains no newlines; build multi-line markdown in the consuming job as above.

For a JUnit file, pass the CLI's own flags through — `--report junit --report-output-dir ./reports` writes `report_run_<id>.xml` per run.

## Migrating from `maestro-cloud`

Replace the whole pre-packaged job with a custom job. You no longer need a Maestro Cloud project id or API key.

**Before:**

```yaml
jobs:
  e2e:
    needs: [build_android]
    type: maestro-cloud
    params:
      build_id: ${{ needs.build_android.outputs.build_id }}
      maestro_project_id: proj_abc123
      flows: ./.maestro
```

**After:**

```yaml
jobs:
  e2e:
    needs: [build_android]
    steps:
      - uses: eas/checkout
      - uses: eas/download_build
        id: download
        with:
          build_id: ${{ needs.build_android.outputs.build_id }}
      - id: testingbot
        run: |
          npx --yes @testingbot/eas-workflow@v1 \
            --app-file ${{ steps.download.outputs.artifact_path }} \
            --flows ./.maestro
```

Parameter mapping:

| `maestro-cloud` param                   | TestingBot equivalent                    |
| --------------------------------------- | ---------------------------------------- |
| `build_id`                              | `eas/download_build` step + `--app-file` |
| `flows`                                 | `--flows`                                |
| `maestro_project_id`, `maestro_api_key` | not needed; use `TB_KEY` / `TB_SECRET`   |
| `include_tags`, `exclude_tags`          | `--include-tags`, `--exclude-tags`       |
| `maestro_version`                       | `--maestro-version`                      |
| `maestro_config`                        | `--config`                               |
| `device_locale`                         | `--device-locale`                        |
| `device_model`, `device_os`             | `--device`, `--deviceVersion`            |
| `name`                                  | `--name` or `TB_RUN_NAME`                |
| `async`                                 | `--async`                                |

Outputs keep the same names, so downstream `github-comment` and `slack` jobs need no changes: `total_flows_count`, `successful_flows_count`, `failed_flows_count`, and `successful_flow_names_json` all carry over. Only `maestro_cloud_url` is renamed, to `console_url`.

## How it works

The package is a thin wrapper. It validates the environment, resolves the latest `@testingbot/cli` (1.2.0 or newer), and runs `npx @testingbot/cli maestro <app> <flows> … --json-file` with your credentials and CI metadata attached. The CLI does the real work: uploading the app and flows, starting the run, streaming progress, and polling for results; inside an EAS Build job it also records the EAS build id, profile, platform and commit on the run by itself. All CLI output is streamed to stderr so you see live progress in the EAS logs, while stdout carries only the `set-output` lines EAS reads, filled from the CLI's JSON results document.

With the TestingBot GitHub App installed for the repository, a run that carries `TB_GH_REPO_OWNER`, `TB_GH_REPO_NAME` and a full `TB_GH_SHA` also posts a `TestingBot / tests` status check on the pull request.

## Development

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm build       # bundle src/ into dist/index.js with ncc
```

`dist/index.js` is committed so `npx @testingbot/eas-workflow` works without a build step. Rebuild and commit it with any source change.

## License

MIT
