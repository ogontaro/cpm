class Cpm < Formula
  desc "Claude Code plugin manager driven by a declarative manifest"
  homepage "https://github.com/ogontaro/cpm"
  version "1.0.0"
  license "MIT"

  # homebrew-coreのcpm(CPANモジュールインストーラ)と同名のバイナリを入れる
  conflicts_with "cpm", because: "both install a `cpm` binary"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-arm64.tar.gz"
      sha256 "16c2f064cb2c21af84f30c64d2ee49029a9b940b19732cfaef1fd77b302262f0"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-darwin-amd64.tar.gz"
      sha256 "66c2d0f38683402e02fc8ffcfbbebf8484bf52763c310a269f6b1f6c3d90177b"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-arm64.tar.gz"
      sha256 "8cada1ae304a8514821ab1d180236b4f68d6e335af228407b21c39f36f9f6873"
    else
      url "https://github.com/ogontaro/cpm/releases/download/v#{version}/cpm-linux-amd64.tar.gz"
      sha256 "8e14c694e5f37c51c7c56305d3310379e17bbc468efd8e3a9a7a966be07da676"
    end
  end

  def install
    bin.install "cpm"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cpm --version")
  end
end
