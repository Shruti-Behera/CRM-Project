#!/usr/bin/env bash
# Same as build-client.ps1, for building on a Linux/macOS machine.
set -e
cd "$(dirname "$0")/../client"
npm install && npm run build
rm -rf ../Server/wwwroot
cp -r dist ../Server/wwwroot
echo "Web app copied to Server/wwwroot"
