class Cpm < Formula
  desc "Claude Code plugin manager driven by a declarative manifest"
  homepage "https://github.com/ogontaro/cpm"
  version "1.1.2"
  license "MIT"

  # homebrew-coreのcpm(CPANモジュールインストーラ)と同名のバイナリを入れる
  conflicts_with "cpm", because: "both install a `cpm` binary"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-arm64.tar.gz"
      sha256 "acc92615576551b618f36239addaa2f71c3bdffb83052d7e0e2c7a78ad634d44"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-amd64.tar.gz"
      sha256 "2bee9311741d5f0ed064bc2c574ec0b6d160b1806f913ca7f1ea916253b7c625"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-arm64.tar.gz"
      sha256 "3b97cdcba43448f0bb0e659f86c7d43b13a7c478d07cafdcc176a1aec5c2bff3"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-amd64.tar.gz"
      sha256 "d6b8ce06c071eacf43f6a98e06dce078bb7a284cfd5680c28575b259da56bffc"
    end
  end

  def install
    bin.install "cpm"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cpm --version")
  end
end
