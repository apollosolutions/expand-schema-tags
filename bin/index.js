#!/usr/bin/env node

import { Command, Option, runExit } from "clipanion";
import { readFile } from "fs/promises";
import getStdin from "get-stdin";
import { expandSchemaTag } from "../index.js";

runExit(
  class DefaultCommand extends Command {
    file = Option.String("--file,-f");

    inherit = Option.Boolean("--apply-inheritance,-i");

    async execute() {
      const sdl = this.file
        ? await readFile(this.file, "utf-8")
        : await getStdin();

      if (!sdl || !sdl.length) {
        this.context.stderr.write("invalid SDL\n");
        process.exit(1);
      }

      this.context.stdout.write(
        expandSchemaTag(sdl, { applyInheritance: this.inherit ?? false }) + "\n"
      );
    }
  }
);
