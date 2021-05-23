#!/bin/sh

if ! command -v zip >/dev/null; then
	echo "Error: zip is required." 1>&2
	exit 1
fi

archive="dftps.zip"

sudo ~/.deno/bin/deno compile -A --unstable ./dftps.ts

if [ -f "$archive" ]; then
  rm "$archive"
fi

cp default.config.toml dftps.toml

zip "$archive" dftps dftps.toml

rm dftps
rm dftps.toml