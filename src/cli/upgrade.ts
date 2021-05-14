import {
  Command,
  colors
} from "../../deps.ts";

import { version } from "./mod.ts";

async function run(commands: string[]): Promise<void> {
  try {
    const pdl = Deno.run({ cmd: commands, stderr: 'piped', stdout: 'piped' });
    const [status, stdout, stderr] = await Promise.all([
      pdl.status(),
      pdl.output(),
      pdl.stderrOutput()
    ]);
    pdl.close();
    const error = new TextDecoder().decode(stderr);
    const output = new TextDecoder().decode(stdout);
    if (!status.success) throw new TextDecoder().decode(stderr);
    if (error.length !== 0) console.log(error);
    if (output.length !== 0) console.log(output);
  } catch (e) {
    throw e;
  }
}

export const upgradeCommands = new Command()
  //.option("-u, --username [val:string]", "Username of ftp account.", { global: true, required: true })
  .description("Upgrade dftps.")
  .action(async () => {
    try {
      const release = await latest();
      if (release.tag_name.replace("v", "") === version) return console.log(colors.bold.magenta("You already have latest release installed."));
      console.log(`Download latest version of DFtpS (${release.tag_name})`);
      await run([ "curl", "--fail", "--location", "--progress-bar", "--output", "dftps.zip", release.assets[0].browser_download_url ]);
      await run([ "unzip", "-o", "-j", "dftps.zip", "dftps", "-d", "/usr/bin" ]);
      await run([ "sudo", "rm", "dftps.zip" ]);
      await run([ "sudo", "chmod", "+x", "/usr/bin/dftps" ]);
      console.log(`DftpS was upgraded successfully\nRun 'dftps --help' to get started`);
    } catch(e) {
      throw e
    }
  })

export async function latest() {
  try {
    const uri = "https://api.github.com/repos/devartsite/dftps/releases/latest";
    const response = await fetch(uri);
    return await response.json();
  } catch(e) {
    throw e;
  }
}


/*
bin_dir="/usr/bin"
exe="dftps"
config="default.config.toml"

chmod +x "$bin_dir/dftps"

cp "$bin_dir/$config" "/etc"
mv "/etc/$config" "/etc/$exe.toml"

echo "DftpS was installed successfully"
echo "You must be modify you'r config file in '/etc/$exe.toml'"
echo "Run 'dftps --help' to get started"
*/