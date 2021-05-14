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
archive="$exe.zip"
config="$exe.toml"

curl --fail --location --progress-bar --output "$exe.zip" "$uri"
unzip -o -j "$archive" "$exe" -d "$bin_dir"

if [ ! -f "/etc/$exe.toml" ]; 
  unzip -o -j "$archive" "$config" -d "/etc"
fi

chmod +x "$bin_dir/$exe"
rm "$exe.zip"

echo "DftpS was installed successfully"
echo "You must be modify you'r config file in '/etc/$exe.toml'"
echo "Run 'dftps --help' to get started"
