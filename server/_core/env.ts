export const ENV = {
  get cookieSecret() {
    return process.env.JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.BUILT_IN_FORGE_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.BUILT_IN_FORGE_API_KEY ?? "";
  },
  get dnaWorksExecutablePath() {
    return process.env.DNAWORKS_EXECUTABLE_PATH ?? "";
  },
  get dnaWorksWorkdir() {
    return process.env.DNAWORKS_WORKDIR ?? "";
  },
};
