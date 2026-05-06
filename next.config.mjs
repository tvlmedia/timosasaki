/** @type {import('next').NextConfig} */
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isPagesBuild = process.env.GITHUB_ACTIONS === "true" && repoName.length > 0;
const envBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const normalizedEnvBasePath = envBasePath
  ? `/${envBasePath.replace(/^\/+/, "").replace(/\/+$/, "")}`
  : "";
const basePath = normalizedEnvBasePath || (isPagesBuild ? `/${repoName}` : "");

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  basePath,
  assetPrefix: basePath || undefined
};

export default nextConfig;
