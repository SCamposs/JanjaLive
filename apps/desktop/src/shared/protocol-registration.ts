export type ProtocolRegistration = {
  executable: string;
  args: string[];
};

export function getProtocolRegistration(input: {
  isPackagedSmokeTest: boolean;
  isDefaultApp: boolean;
  executable: string;
  entryPath?: string;
}): ProtocolRegistration | null {
  if (input.isPackagedSmokeTest) return null;
  if (input.isDefaultApp && !input.entryPath) return null;
  return {
    executable: input.executable,
    args: input.isDefaultApp ? [input.entryPath as string] : [],
  };
}
