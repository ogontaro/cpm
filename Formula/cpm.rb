class Cpm < Formula
  desc "Claude Code plugin manager driven by a declarative manifest"
  homepage "https://github.com/ogontaro/cpm"
  version "0.2.0"
  license "MIT"

  # homebrew-coreのcpm(CPANモジュールインストーラ)と同名のバイナリを入れる
  conflicts_with "cpm", because: "both install a `cpm` binary"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-arm64.tar.gz"
      sha256 "3e07137ae771856fac98f40fda7be497138c3167b36e26995e2f2361976bdf7a"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-amd64.tar.gz"
      sha256 "6cbaad336a063ed7f20f3ec6240749ec9d03935ee3e512ea952312779558386b"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-arm64.tar.gz"
      sha256 "b1c828b5bb0aebd0e711a7b494fdb5c80181379b72f4f5160ba8451b9baddacc"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-amd64.tar.gz"
      sha256 "88a31deb3ec186fb77edac526d03a2005c1c4988e243e8c375fddb1d45a1b674"
    end
  end

  def install
    bin.install "cpm"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cpm --version")
  end
end
