class Cpm < Formula
  desc "Claude Code plugin manager driven by a declarative manifest"
  homepage "https://github.com/ogontaro/cpm"
  version "0.1.0"
  license "MIT"

  # homebrew-coreのcpm(CPANモジュールインストーラ)と同名のバイナリを入れる
  conflicts_with "cpm", because: "both install a `cpm` binary"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-arm64.tar.gz"
      sha256 "fb356c2dac6448d2422c0abfd777c1df7c36ac77e7d52f5dacd6bb61c2065d01"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-amd64.tar.gz"
      sha256 "4d86629ef2f37c4a6f68b19d74cf51fb00fb2d45696c645f0776119e524f77cd"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-arm64.tar.gz"
      sha256 "75e3ab3d6cdb391691e7f05c439bb711268f41df6c3dd1dd36c0ff4dcf8d240f"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-amd64.tar.gz"
      sha256 "e35305f33caefa05ca0acb42d9f5e6c046f905ef6c285a701961cf6d6957ee15"
    end
  end

  def install
    bin.install "cpm"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cpm --version")
  end
end
