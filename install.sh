#!/bin/sh

set -e

if ! command -v unzip >/dev/null; then
	echo "Error: unzip is required to install DFtpS." 1>&2
	exit 1
fi

if [ "$OS" = "Windows_NT" ]; then
	echo "Error: DFtpS Not Compatible with windows." 1>&2
	exit 1
else
	case $(uname -sm) in
	"Darwin x86_64")
  	echo "Error: DFtpS Not Compatible with windows." 1>&2
	  exit 1
  ;;
	"Darwin arm64")
  	echo "Error: DFtpS Not Compatible with windows." 1>&2
	  exit 1
  ;;
	esac
fi

if [ $# -eq 0 ]; then
	uri="https://github.com/DevArtSite/DFtpS/releases/latest/download/dftps.zip"
else
	uri="https://github.com/DevArtSite/DFtpS/releases/download/${1}/dftps.zip"
fi

bin_dir="/usr/bin"
exe="dftps"
config="default.config.toml"

curl --fail --location --progress-bar --output "$exe.zip" "$uri"
unzip -d "$bin_dir" -o "$exe.zip"
chmod +x "$bin_dir/dftps"
cp "$config" "/etc"
mv "/etc/$config" "/etc/$exe.toml"
rm "$exe.zip"

echo "DftpS was installed successfully"
echo "Run 'dftps --help' to get started"
