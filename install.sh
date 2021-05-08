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
	"Darwin arm64")
  	echo "Error: DFtpS Not Compatible with windows." 1>&2
	  exit 1
  ;;
	esac
fi

if [ $# -eq 0 ]; then
	uri="https://github.com/DevArtSite/DFtpS/releases/latest/download/DFtpS.zip"
else
	uri="https://github.com/DevArtSite/DFtpS/releases/download/${1}/DFtpS.zip"
fi

bin_dir="/usr/bin"
exe="$bin_dir/dftps"

curl --fail --location --progress-bar --output "$exe.zip" "$uri"
unzip -d "$bin_dir" -o "$exe.zip"
chmod +x "$exe"
rm "$exe.zip"

echo "DftpS was installed successfully"
echo "Run 'DftpS --help' to get started"
