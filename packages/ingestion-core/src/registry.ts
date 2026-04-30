import type { Source } from "@timesheet-ai/domain";
import type { IngestionPlugin } from "./types";

const plugins = new Map<Source, IngestionPlugin>();

export const registerPlugin = (plugin: IngestionPlugin): void => {
  plugins.set(plugin.source, plugin);
};

export const getPlugin = (source: Source): IngestionPlugin | undefined =>
  plugins.get(source);

export const getAllPlugins = (): ReadonlyArray<IngestionPlugin> =>
  Array.from(plugins.values());
