class Cpm < Formula
  desc "Claude Code plugin manager driven by a declarative manifest"
  homepage "https://github.com/ogontaro/cpm"
  version "0.3.1"
  license "MIT"

  # homebrew-coreのcpm(CPANモジュールインストーラ)と同名のバイナリを入れる
  conflicts_with "cpm", because: "both install a `cpm` binary"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-arm64.tar.gz"
      sha256 "424cb10539adae2a0141b62cc0f09340de5907cca1741a90f17928cde765bf16"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-amd64.tar.gz"
      sha256 "42562cd181fa39afdad11c3a54c9559b88480d8f3815cb04c3996a73656bf817"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-arm64.tar.gz"
      sha256 "aa0e33b78c31b4ce813fbd7428c142ea0bcc7ed7fb8e8adc08a250f7ab72a35d"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-amd64.tar.gz"
      sha256 "39cac0710e67f776bf1599e5e4f61a72ae4de3ff4a45ef599652cb5a29aff516"
    end
  end

  def install
    bin.install "cpm"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cpm --version")
  end
end
