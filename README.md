# sit — Steady Input Terminal

[![Release](https://img.shields.io/github/v/release/aki-kuramoto/sit)](https://github.com/aki-kuramoto/sit/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Download

Pre-built binaries for all platforms are available on the [Releases](https://github.com/aki-kuramoto/sit/releases/latest) page:

| Platform | Download |
|---|---|
| Windows (x64) | [sit-windows-amd64.exe](https://github.com/aki-kuramoto/sit/releases/latest/download/sit-windows-amd64.exe) |
| Windows (ARM64) | [sit-windows-arm64.exe](https://github.com/aki-kuramoto/sit/releases/latest/download/sit-windows-arm64.exe) |
| macOS (Apple Silicon) | [sit-darwin-arm64.app.zip](https://github.com/aki-kuramoto/sit/releases/latest/download/sit-darwin-arm64.app.zip) |
| macOS (Intel) | [sit-darwin-amd64.app.zip](https://github.com/aki-kuramoto/sit/releases/latest/download/sit-darwin-amd64.app.zip) |
| Linux (x64) | [sit-linux-amd64](https://github.com/aki-kuramoto/sit/releases/latest/download/sit-linux-amd64) |
| Linux (ARM64) | [sit-linux-arm64](https://github.com/aki-kuramoto/sit/releases/latest/download/sit-linux-arm64) |

## What is sit?

**sit** is a desktop terminal emulator with a persistent multi-line input box. Unlike traditional terminals where you type directly into the shell, sit provides a separate text area at the bottom of the window for composing commands. This lets you edit multi-line input comfortably before sending it to the terminal.

### Key Features

- **Persistent input box** — A multi-line text area stays at the bottom, separate from the terminal output
- **Multiple shell profiles** — Save and switch between shell configurations (e.g. cmd, PowerShell, bash, zsh)
- **Configurable key bindings** — Customize keyboard shortcuts for both the input box and the terminal
- **Theme presets** — Choose from 4 built-in themes (light/dark UI × light/dark terminal) with custom color overrides
- **Bell actions** — Configurable responses to terminal bell: visual flash, sound playback, or emoji indicator
- **Command mode** — tmux-inspired prefix key for terminal-side actions

### Shell Profiles

Shell profiles let you define any shell or command-line environment as a named profile. Each profile specifies the executable, its arguments, and optionally additional environment variables (`env`) and extra directories to add to `PATH` (`pathAppend`).

**WSL (Windows Subsystem for Linux)**

```json
{
  "name": "WSL",
  "command": "wsl.exe",
  "args": []
}
```

To launch a specific distribution, use the `--distribution` flag:

```json
{
  "name": "Ubuntu on WSL",
  "command": "wsl.exe",
  "args": ["--distribution", "Ubuntu"]
}
```

**MSYS2 (UCRT64)**

When launching MSYS2's bash directly (by its full path), you need to set the `MSYSTEM` environment variable and add MSYS2's `/usr/bin` to `PATH` so that login profile scripts can find tools like `cygpath`:

```json
{
  "name": "MSYS2 UCRT64",
  "command": "C:\\msys64\\usr\\bin\\bash.exe",
  "args": ["--login"],
  "env": ["MSYSTEM=UCRT64", "CHERE_INVOKING=1"],
  "pathAppend": ["C:\\msys64\\usr\\bin"]
}
```

> `CHERE_INVOKING=1` prevents bash from changing to the home directory on login.

### Built With

- [Go](https://go.dev/) + [Wails v2](https://wails.io/) — Backend and native window
- [xterm.js](https://xtermjs.org/) — Terminal emulation
- TypeScript + Vite — Frontend

## Build from Source

### Prerequisites

- Go 1.23+
- Node.js 20+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) v2

```bash
# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Build
wails build

# Run
./build/bin/sit
```

## Installation

### Windows
Download the `.exe` and run it directly.

### macOS
1. Download the `.app.zip` and extract it
2. Move `sit.app` to the Applications folder
3. Before launching for the first time, run in Terminal:
   ```bash
   xattr -cr /Applications/sit.app
   ```
   > This removes the quarantine flag. The app is unsigned, so macOS will block it without this step.

### Linux
Download the binary, make it executable, and run:
```bash
chmod +x sit-linux-amd64
./sit-linux-amd64
```

## License

MIT License © 2026- Akihiro Kuramoto

---

# sit — Steady Input Terminal（日本語）

## ダウンロード

各プラットフォーム向けのビルド済みバイナリは [Releases](https://github.com/aki-kuramoto/sit/releases/latest) ページからダウンロードできます。

## sit とは？

**sit** は、固定のマルチライン入力ボックスを備えたデスクトップターミナルエミュレータです。従来のターミナルではシェルに直接入力しますが、sit ではウィンドウ下部に独立したテキストエリアがあり、複数行のコマンドを快適に編集してからターミナルに送信できます。

### 主な機能

- **固定入力ボックス** — ターミナル出力とは独立した、常に表示されるマルチラインテキストエリア
- **複数のシェルプロファイル** — シェル設定を保存して切り替え可能（例: cmd, PowerShell, bash, zsh）
- **カスタマイズ可能なキーバインド** — 入力ボックスとターミナル両方のキーボードショートカットを設定可能
- **テーマプリセット** — 4種の組み込みテーマ（ライト/ダーク UI × ライト/ダーク端末）と個別カラーオーバーライド
- **ベルアクション** — ターミナルベルへの応答を設定可能: 視覚的フラッシュ、音声再生、絵文字表示
- **コマンドモード** — tmux に着想を得たプレフィックスキーによるターミナル側アクション

### シェルプロファイル

シェルプロファイルでは、任意のシェルやコマンドライン環境を名前付きプロファイルとして定義できます。各プロファイルには実行ファイル、引数に加えて、追加の環境変数（`env`）や `PATH` に追加するディレクトリ（`pathAppend`）を指定できます。

**WSL (Windows Subsystem for Linux)**

```json
{
  "name": "WSL",
  "command": "wsl.exe",
  "args": []
}
```

特定のディストリビューションを起動するには `--distribution` フラグを使用します:

```json
{
  "name": "Ubuntu on WSL",
  "command": "wsl.exe",
  "args": ["--distribution", "Ubuntu"]
}
```

**MSYS2 (UCRT64)**

MSYS2 の bash をフルパスで直接起動する場合、`MSYSTEM` 環境変数の設定と MSYS2 の `/usr/bin` を `PATH` に追加する必要があります。これにより、ログインプロファイルスクリプトが `cygpath` などのツールを見つけられるようになります:

```json
{
  "name": "MSYS2 UCRT64",
  "command": "C:\\msys64\\usr\\bin\\bash.exe",
  "args": ["--login"],
  "env": ["MSYSTEM=UCRT64", "CHERE_INVOKING=1"],
  "pathAppend": ["C:\\msys64\\usr\\bin"]
}
```

> `CHERE_INVOKING=1` を設定すると、ログイン時にホームディレクトリに移動しなくなります。

### 使用技術

- [Go](https://go.dev/) + [Wails v2](https://wails.io/) — バックエンドとネイティブウィンドウ
- [xterm.js](https://xtermjs.org/) — ターミナルエミュレーション
- TypeScript + Vite — フロントエンド

## ソースからビルド

### 必要なもの

- Go 1.23+
- Node.js 20+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) v2

```bash
# Wails CLI のインストール
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# ビルド
wails build

# 実行
./build/bin/sit
```

## インストール方法

### Windows
`.exe` をダウンロードしてそのまま実行できます。

### macOS
1. `.app.zip` をダウンロードして解凍
2. `sit.app` を Applications フォルダに移動
3. 初回起動前にターミナルで以下を実行:
   ```bash
   xattr -cr /Applications/sit.app
   ```
   > 未署名アプリの quarantine フラグを解除します。この手順なしでは macOS がブロックします。

### Linux
バイナリをダウンロードし、実行権限を付与して起動:
```bash
chmod +x sit-linux-amd64
./sit-linux-amd64
```

## ライセンス

MIT License © 2026- Akihiro Kuramoto
