#!/usr/bin/env node

/**
 * ------------------------------------------------------------------------------
 * Package : @raviraj87/jenkins-mcp
 * File    : index.ts
 * Purpose : MCP server bootstrap — Jenkins API client and tool registry.
 *
 * Copyright (c) 2026 Ravi Raj
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * SPDX-License-Identifier: MIT
 * ------------------------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------------------------
 * Package : @raviraj87/jenkins-mcp
 * File    : index.ts
 * Purpose : MCP server bootstrap — Jenkins API client and tool registry.
 *
 * Copyright (c) 2026 Ravi Raj
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * SPDX-License-Identifier: MIT
 * ------------------------------------------------------------------------------
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type Crumb = {
  crumbRequestField: string;
  crumb: string;
};

class JenkinsClient {
  private readonly baseUrl: string;
  private readonly authHeader: string | null;
  private readonly allowScriptConsole: boolean;
  private crumb: Crumb | null = null;

  constructor() {
    const rawBaseUrl = process.env.JENKINS_URL?.trim();
    if (!rawBaseUrl) {
      throw new Error("JENKINS_URL is required");
    }
    this.baseUrl = rawBaseUrl.replace(/\/+$/, "");

    const user = process.env.JENKINS_USERNAME?.trim();
    const token = process.env.JENKINS_API_TOKEN?.trim();
    this.allowScriptConsole =
      process.env.JENKINS_ALLOW_SCRIPT_CONSOLE?.toLowerCase() === "true";

    if (user && token) {
      this.authHeader = `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
    } else {
      this.authHeader = null;
    }
  }

  private headers(contentType?: string, withCrumb?: boolean): HeadersInit {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.authHeader) h.Authorization = this.authHeader;
    if (contentType) h["Content-Type"] = contentType;
    if (withCrumb && this.crumb) {
      h[this.crumb.crumbRequestField] = this.crumb.crumb;
    }
    return h;
  }

  private async ensureCrumb(): Promise<void> {
    if (this.crumb) return;
    const res = await fetch(`${this.baseUrl}/crumbIssuer/api/json`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      return;
    }
    this.crumb = (await res.json()) as Crumb;
  }

  private async request(
    path: string,
    init: RequestInit = {},
    mutate = false,
  ): Promise<Response> {
    if (mutate) {
      await this.ensureCrumb();
      init.headers = {
        ...this.headers(undefined, true),
        ...(init.headers ?? {}),
      };
    } else {
      init.headers = {
        ...this.headers(),
        ...(init.headers ?? {}),
      };
    }

    let res = await fetch(`${this.baseUrl}${path}`, init);
    if ((res.status === 403 || res.status === 401) && mutate) {
      this.crumb = null;
      await this.ensureCrumb();
      init.headers = {
        ...this.headers(undefined, true),
        ...(init.headers ?? {}),
      };
      res = await fetch(`${this.baseUrl}${path}`, init);
    }
    return res;
  }

  private jobPath(jobFullName: string): string {
    return jobFullName
      .split("/")
      .filter(Boolean)
      .map((part) => `job/${encodeURIComponent(part)}`)
      .join("/");
  }

  async health(): Promise<unknown> {
    const res = await this.request("/api/json");
    if (!res.ok) {
      throw new Error(`Jenkins health check failed: ${res.status}`);
    }
    return res.json();
  }

  async listJobs(folder?: string): Promise<unknown> {
    const prefix = folder ? `/${this.jobPath(folder)}` : "";
    const res = await this.request(
      `${prefix}/api/json?tree=jobs[name,fullName,url,color,_class]`,
    );
    if (!res.ok) throw new Error(`listJobs failed: ${res.status}`);
    return res.json();
  }

  async getJob(jobFullName: string): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/api/json?depth=2`,
    );
    if (!res.ok) throw new Error(`getJob failed: ${res.status}`);
    return res.json();
  }

  async triggerBuild(
    jobFullName: string,
    params?: Record<string, string>,
  ): Promise<{ status: number; location: string | null }> {
    const hasParams = params && Object.keys(params).length > 0;
    const endpoint = hasParams ? "buildWithParameters" : "build";
    const body = hasParams ? new URLSearchParams(params).toString() : undefined;
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${endpoint}`,
      {
        method: "POST",
        headers: hasParams
          ? { ...this.headers("application/x-www-form-urlencoded", true) }
          : undefined,
        body,
      },
      true,
    );
    if (!(res.status === 201 || res.status === 200 || res.status === 302)) {
      throw new Error(`triggerBuild failed: ${res.status}`);
    }
    return { status: res.status, location: res.headers.get("location") };
  }

  async getBuild(jobFullName: string, buildNumber: string): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/api/json`,
    );
    if (!res.ok) throw new Error(`getBuild failed: ${res.status}`);
    return res.json();
  }

  async stopBuild(jobFullName: string, buildNumber: string): Promise<number> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/stop`,
      { method: "POST" },
      true,
    );
    if (!(res.status === 200 || res.status === 201 || res.status === 302)) {
      throw new Error(`stopBuild failed: ${res.status}`);
    }
    return res.status;
  }

  async getConsole(
    jobFullName: string,
    buildNumber: string,
    start = 0,
  ): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/logText/progressiveText?start=${start}`,
      { headers: { Accept: "text/plain" } },
    );
    if (!res.ok) throw new Error(`getConsole failed: ${res.status}`);
    const text = await res.text();
    return {
      text,
      moreData: res.headers.get("X-More-Data") === "true",
      nextStart: Number(res.headers.get("X-Text-Size") ?? start),
    };
  }

  async getQueue(): Promise<unknown> {
    const res = await this.request("/queue/api/json?depth=1");
    if (!res.ok) throw new Error(`getQueue failed: ${res.status}`);
    return res.json();
  }

  async getQueueItem(id: string): Promise<unknown> {
    const res = await this.request(`/queue/item/${encodeURIComponent(id)}/api/json`);
    if (!res.ok) throw new Error(`getQueueItem failed: ${res.status}`);
    return res.json();
  }

  async cancelQueueItem(id: string): Promise<number> {
    const res = await this.request(`/queue/cancelItem?id=${encodeURIComponent(id)}`, { method: "POST" }, true);
    if (!(res.status === 200 || res.status === 302)) {
      throw new Error(`cancelQueueItem failed: ${res.status}`);
    }
    return res.status;
  }

  async whoAmI(): Promise<unknown> {
    const res = await this.request("/whoAmI/api/json");
    if (!res.ok) throw new Error(`whoAmI failed: ${res.status}`);
    return res.json();
  }

  async getStatus(): Promise<unknown> {
    const [systemRes, quietRes] = await Promise.all([
      this.request("/api/json?tree=mode,nodeDescription,numExecutors,useCrumbs"),
      this.request("/quietDown/api/json").catch(() => null),
    ]);
    if (!systemRes.ok) throw new Error(`getStatus failed: ${systemRes.status}`);
    const system = await systemRes.json();
    const quietDown = quietRes && quietRes.ok ? await quietRes.json() : null;
    return { system, quietDown };
  }

  async listNodes(): Promise<unknown> {
    const res = await this.request("/computer/api/json?depth=2");
    if (!res.ok) throw new Error(`listNodes failed: ${res.status}`);
    return res.json();
  }

  async listPlugins(): Promise<unknown> {
    const res = await this.request("/pluginManager/api/json?depth=1");
    if (!res.ok) throw new Error(`listPlugins failed: ${res.status}`);
    return res.json();
  }

  async getSystemInfo(): Promise<unknown> {
    const res = await this.request("/overallLoad/api/json");
    if (!res.ok) throw new Error(`getSystemInfo failed: ${res.status}`);
    return res.json();
  }

  async getJobConfig(jobFullName: string): Promise<string> {
    const res = await this.request(`/${this.jobPath(jobFullName)}/config.xml`, {
      headers: { Accept: "application/xml" },
    });
    if (!res.ok) throw new Error(`getJobConfig failed: ${res.status}`);
    return res.text();
  }

  async updateJobConfig(jobFullName: string, configXml: string): Promise<number> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/config.xml`,
      {
        method: "POST",
        headers: { ...this.headers("application/xml", true) },
        body: configXml,
      },
      true,
    );
    if (!(res.status === 200 || res.status === 201)) {
      throw new Error(`updateJobConfig failed: ${res.status}`);
    }
    return res.status;
  }

  async createJob(
    name: string,
    configXml: string,
    folder?: string,
  ): Promise<number> {
    const prefix = folder ? `/${this.jobPath(folder)}` : "";
    const res = await this.request(
      `${prefix}/createItem?name=${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: { ...this.headers("application/xml", true) },
        body: configXml,
      },
      true,
    );
    if (!(res.status === 200 || res.status === 201)) {
      throw new Error(`createJob failed: ${res.status}`);
    }
    return res.status;
  }

  async copyJob(srcFullName: string, destName: string, folder?: string): Promise<number> {
    const prefix = folder ? `/${this.jobPath(folder)}` : "";
    const mode = "copy";
    const from = encodeURIComponent(srcFullName);
    const res = await this.request(
      `${prefix}/createItem?name=${encodeURIComponent(destName)}&mode=${mode}&from=${from}`,
      { method: "POST" },
      true,
    );
    if (!(res.status === 200 || res.status === 201 || res.status === 302)) {
      throw new Error(`copyJob failed: ${res.status}`);
    }
    return res.status;
  }

  async deleteJob(jobFullName: string): Promise<number> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/doDelete`,
      { method: "POST" },
      true,
    );
    if (!(res.status === 200 || res.status === 302)) {
      throw new Error(`deleteJob failed: ${res.status}`);
    }
    return res.status;
  }

  async getArtifacts(jobFullName: string, buildNumber: string): Promise<unknown> {
    const data = await this.getBuild(jobFullName, buildNumber);
    const build = data as { artifacts?: Array<Record<string, unknown>>; url?: string };
    return {
      buildUrl: build.url ?? null,
      artifacts: build.artifacts ?? [],
    };
  }

  async updateBuild(
    jobFullName: string,
    buildNumber: string,
    displayName?: string,
    description?: string,
  ): Promise<number[]> {
    const statuses: number[] = [];
    if (displayName !== undefined) {
      const res = await this.request(
        `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/configSubmit`,
        {
          method: "POST",
          headers: { ...this.headers("application/x-www-form-urlencoded", true) },
          body: new URLSearchParams({ displayName }).toString(),
        },
        true,
      );
      if (!(res.status === 200 || res.status === 302)) {
        throw new Error(`updateBuild displayName failed: ${res.status}`);
      }
      statuses.push(res.status);
    }
    if (description !== undefined) {
      const res = await this.request(
        `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/submitDescription`,
        {
          method: "POST",
          headers: { ...this.headers("application/x-www-form-urlencoded", true) },
          body: new URLSearchParams({ description }).toString(),
        },
        true,
      );
      if (!(res.status === 200 || res.status === 302)) {
        throw new Error(`updateBuild description failed: ${res.status}`);
      }
      statuses.push(res.status);
    }
    return statuses;
  }

  async getTestResults(jobFullName: string, buildNumber: string): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/testReport/api/json?depth=2`,
    );
    if (!res.ok) throw new Error(`getTestResults failed: ${res.status}`);
    return res.json();
  }

  async getBuildChangeSets(jobFullName: string, buildNumber: string): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/api/json?tree=changeSets[kind,items[commitId,msg,author[fullName],timestamp,affectedPaths]]`,
    );
    if (!res.ok) throw new Error(`getBuildChangeSets failed: ${res.status}`);
    return res.json();
  }

  async getJobScm(jobFullName: string): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/api/json?tree=scm[*],properties[*],definition[scm[*]]`,
    );
    if (!res.ok) throw new Error(`getJobScm failed: ${res.status}`);
    return res.json();
  }

  async getBuildScm(jobFullName: string, buildNumber: string): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/api/json?tree=actions[remoteUrls,lastBuiltRevision[*]]`,
    );
    if (!res.ok) throw new Error(`getBuildScm failed: ${res.status}`);
    return res.json();
  }

  async searchBuildLog(
    jobFullName: string,
    buildNumber: string,
    pattern: string,
    maxMatches = 50,
  ): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/consoleText`,
      { headers: { Accept: "text/plain" } },
    );
    if (!res.ok) throw new Error(`searchBuildLog failed: ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    const regex = new RegExp(pattern, "i");
    const matches: Array<{ line: number; text: string }> = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (regex.test(lines[i])) {
        matches.push({ line: i + 1, text: lines[i] });
        if (matches.length >= maxMatches) break;
      }
    }
    return { pattern, totalLines: lines.length, matchCount: matches.length, matches };
  }

  async findJobsWithScmUrl(scmUrlPart: string, folder?: string): Promise<unknown> {
    const results: Array<{ jobFullName: string; scmPreview: string }> = [];
    const queue: Array<string | undefined> = [folder];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      const key = current ?? "__root__";
      if (seen.has(key)) continue;
      seen.add(key);

      const listing = (await this.listJobs(current)) as {
        jobs?: Array<{ fullName?: string; name?: string; _class?: string }>;
      };
      for (const j of listing.jobs ?? []) {
        const fullName = j.fullName ?? (current ? `${current}/${j.name}` : j.name);
        if (!fullName) continue;
        const isFolder = (j._class ?? "").toLowerCase().includes("folder");
        if (isFolder) {
          queue.push(fullName);
          continue;
        }
        try {
          const scm = await this.getJobScm(fullName);
          const json = JSON.stringify(scm);
          if (json.toLowerCase().includes(scmUrlPart.toLowerCase())) {
            results.push({ jobFullName: fullName, scmPreview: json.slice(0, 400) });
          }
        } catch {
          // ignore inaccessible jobs
        }
      }
    }
    return { query: scmUrlPart, count: results.length, results };
  }

  async rebuildBuild(jobFullName: string, buildNumber: string): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/rebuild`,
      { method: "POST" },
      true,
    );
    if (!(res.status === 200 || res.status === 201 || res.status === 302)) {
      throw new Error(`rebuildBuild failed: ${res.status}`);
    }
    return { status: res.status, location: res.headers.get("location") };
  }

  async getReplayScripts(jobFullName: string, buildNumber: string): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/api/json?tree=actions[replayable,_class]`,
    );
    if (!res.ok) throw new Error(`getReplayScripts failed: ${res.status}`);
    const build = await res.json();
    const config = await this.getJobConfig(jobFullName);
    return { build, configXmlPreview: config.slice(0, 4000) };
  }

  async replayBuild(
    jobFullName: string,
    buildNumber: string,
    mainScript: string,
    loadedScripts?: Record<string, string>,
  ): Promise<unknown> {
    const params = new URLSearchParams({ mainScript });
    if (loadedScripts) {
      for (const [k, v] of Object.entries(loadedScripts)) {
        params.append(`loadedScripts.${k}`, v);
      }
    }
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/replay/run`,
      {
        method: "POST",
        headers: { ...this.headers("application/x-www-form-urlencoded", true) },
        body: params.toString(),
      },
      true,
    );
    if (!(res.status === 200 || res.status === 201 || res.status === 302)) {
      throw new Error(`replayBuild failed: ${res.status}`);
    }
    return { status: res.status, location: res.headers.get("location") };
  }

  async downloadArtifact(
    jobFullName: string,
    buildNumber: string,
    artifactPath: string,
    maxBytes = 500_000,
  ): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/artifact/${artifactPath}`,
      { headers: { Accept: "*/*" } },
    );
    if (!res.ok) throw new Error(`downloadArtifact failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const truncated = buf.length > maxBytes;
    return {
      path: artifactPath,
      size: buf.length,
      truncated,
      contentBase64: buf.subarray(0, maxBytes).toString("base64"),
    };
  }

  async enableJob(jobFullName: string): Promise<number> {
    const res = await this.request(`/${this.jobPath(jobFullName)}/enable`, { method: "POST" }, true);
    if (!(res.status === 200 || res.status === 302)) throw new Error(`enableJob failed: ${res.status}`);
    return res.status;
  }

  async disableJob(jobFullName: string): Promise<number> {
    const res = await this.request(`/${this.jobPath(jobFullName)}/disable`, { method: "POST" }, true);
    if (!(res.status === 200 || res.status === 302)) throw new Error(`disableJob failed: ${res.status}`);
    return res.status;
  }

  async getBuildLog(
    jobFullName: string,
    buildNumber: string,
    start = 0,
    limit?: number,
    tail?: number,
  ): Promise<unknown> {
    const res = await this.request(
      `/${this.jobPath(jobFullName)}/${encodeURIComponent(buildNumber)}/consoleText`,
      { headers: { Accept: "text/plain" } },
    );
    if (!res.ok) throw new Error(`getBuildLog failed: ${res.status}`);
    let lines = (await res.text()).split(/\r?\n/);
    const totalLines = lines.length;
    if (tail !== undefined && tail > 0) {
      lines = lines.slice(Math.max(0, lines.length - tail));
    } else if (start > 0) {
      lines = lines.slice(start);
    }
    if (limit !== undefined && limit > 0) {
      lines = lines.slice(0, limit);
    }
    return { totalLines, returnedLines: lines.length, text: lines.join("\n"), nextStart: start + lines.length };
  }

  async runScriptConsole(script: string): Promise<string> {
    if (!this.allowScriptConsole) {
      throw new Error("Script console disabled. Set JENKINS_ALLOW_SCRIPT_CONSOLE=true to enable.");
    }
    const res = await this.request(
      "/scriptText",
      {
        method: "POST",
        headers: { ...this.headers("application/x-www-form-urlencoded", true) },
        body: new URLSearchParams({ script }).toString(),
      },
      true,
    );
    if (!res.ok) throw new Error(`runScriptConsole failed: ${res.status}`);
    return res.text();
  }
}

const pipelineConfigXml = (script: string, sandbox: boolean): string => `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <actions/>
  <description></description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps">
    <script>${script
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")}</script>
    <sandbox>${sandbox}</sandbox>
  </definition>
  <triggers/>
  <disabled>false</disabled>
</flow-definition>
`;

const stringify = (obj: unknown): string => JSON.stringify(obj, null, 2);
const toContent = (text: string) => ({ content: [{ type: "text" as const, text }] });
async function main(): Promise<void> {
  const jenkins = new JenkinsClient();
  const server = new McpServer({
    name: "jenkins-mcp-server",
      version: "1.0.1",
  });

  function registerTool(
    name: string,
    description: string,
    handler: () => Promise<any>,
  ): void;
  function registerTool<Args extends Record<string, z.ZodTypeAny>>(
    name: string,
    description: string,
    inputSchema: Args,
    handler: (args: z.infer<z.ZodObject<Args>>) => Promise<any>,
  ): void;
  function registerTool<Args extends Record<string, z.ZodTypeAny>>(
    name: string,
    description: string,
    schemaOrHandler: Args | (() => Promise<any>),
    handler?: (args: z.infer<z.ZodObject<Args>>) => Promise<any>,
  ): void {
    if (typeof schemaOrHandler === "function") {
      server.registerTool(name, { description }, schemaOrHandler as any);
      return;
    }
    server.registerTool(name, { description, inputSchema: schemaOrHandler }, handler as any);
  }

  registerTool("jenkins_health", "Check Jenkins API reachability.", async () =>
    toContent(stringify(await jenkins.health())),
  );

  registerTool(
    "list_jobs",
    "List jobs from root or folder.",
    { folder: z.string().optional() },
    async ({ folder }) => toContent(stringify(await jenkins.listJobs(folder))),
  );

  registerTool(
    "get_job",
    "Get job details.",
    { jobFullName: z.string() },
    async ({ jobFullName }) => toContent(stringify(await jenkins.getJob(jobFullName))),
  );

  registerTool(
    "trigger_build",
    "Trigger a Jenkins build with optional parameters.",
    { jobFullName: z.string(), parameters: z.record(z.string()).optional() },
    async ({ jobFullName, parameters }) =>
      toContent(stringify(await jenkins.triggerBuild(jobFullName, parameters))),
  );

  registerTool(
    "get_build",
    "Get build details by job and number.",
    { jobFullName: z.string(), buildNumber: z.string() },
    async ({ jobFullName, buildNumber }) =>
      toContent(stringify(await jenkins.getBuild(jobFullName, buildNumber))),
  );

  registerTool(
    "stop_build",
    "Stop a running build.",
    { jobFullName: z.string(), buildNumber: z.string() },
    async ({ jobFullName, buildNumber }) =>
      toContent(`HTTP ${await jenkins.stopBuild(jobFullName, buildNumber)}`),
  );

  registerTool(
    "get_console",
    "Read progressive console output.",
    { jobFullName: z.string(), buildNumber: z.string(), start: z.number().optional() },
    async ({ jobFullName, buildNumber, start }) =>
      toContent(stringify(await jenkins.getConsole(jobFullName, buildNumber, start ?? 0))),
  );

  registerTool("get_queue", "Get current Jenkins queue.", async () =>
    toContent(stringify(await jenkins.getQueue())),
  );

  registerTool(
    "get_queue_item",
    "Get queue item details by ID.",
    { id: z.string() },
    async ({ id }) => toContent(stringify(await jenkins.getQueueItem(id))),
  );

  registerTool(
    "cancel_queue_item",
    "Cancel queued item by ID.",
    { id: z.string() },
    async ({ id }) => toContent(`HTTP ${await jenkins.cancelQueueItem(id)}`),
  );

  registerTool("who_am_i", "Get current authenticated Jenkins user.", async () =>
    toContent(stringify(await jenkins.whoAmI())),
  );

  registerTool("get_status", "Get Jenkins health/readiness summary.", async () =>
    toContent(stringify(await jenkins.getStatus())),
  );

  registerTool("list_nodes", "List Jenkins nodes and executors.", async () =>
    toContent(stringify(await jenkins.listNodes())),
  );

  registerTool("list_plugins", "List Jenkins plugins.", async () =>
    toContent(stringify(await jenkins.listPlugins())),
  );

  registerTool("get_system_info", "Get Jenkins system load info.", async () =>
    toContent(stringify(await jenkins.getSystemInfo())),
  );

  registerTool(
    "get_job_config",
    "Read job config.xml.",
    { jobFullName: z.string() },
    async ({ jobFullName }) => toContent(await jenkins.getJobConfig(jobFullName)),
  );

  registerTool(
    "update_job_config",
    "Update existing job config.xml.",
    { jobFullName: z.string(), configXml: z.string() },
    async ({ jobFullName, configXml }) =>
      toContent(`HTTP ${await jenkins.updateJobConfig(jobFullName, configXml)}`),
  );

  registerTool(
    "create_job",
    "Create a new job from config.xml.",
    { name: z.string(), configXml: z.string(), folder: z.string().optional() },
    async ({ name, configXml, folder }) =>
      toContent(`HTTP ${await jenkins.createJob(name, configXml, folder)}`),
  );

  registerTool(
    "copy_job",
    "Copy an existing job.",
    { srcFullName: z.string(), destName: z.string(), folder: z.string().optional() },
    async ({ srcFullName, destName, folder }) =>
      toContent(`HTTP ${await jenkins.copyJob(srcFullName, destName, folder)}`),
  );

  registerTool(
    "delete_job",
    "Delete a Jenkins job.",
    { jobFullName: z.string() },
    async ({ jobFullName }) => toContent(`HTTP ${await jenkins.deleteJob(jobFullName)}`),
  );

  registerTool(
    "get_artifacts",
    "List build artifacts.",
    { jobFullName: z.string(), buildNumber: z.string() },
    async ({ jobFullName, buildNumber }) =>
      toContent(stringify(await jenkins.getArtifacts(jobFullName, buildNumber))),
  );

  registerTool(
    "update_build",
    "Update build display name and/or description.",
    {
      jobFullName: z.string(),
      buildNumber: z.string(),
      displayName: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ jobFullName, buildNumber, displayName, description }) =>
      toContent(stringify(await jenkins.updateBuild(jobFullName, buildNumber, displayName, description))),
  );

  registerTool(
    "get_test_results",
    "Retrieve JUnit test results for a build.",
    { jobFullName: z.string(), buildNumber: z.string() },
    async ({ jobFullName, buildNumber }) =>
      toContent(stringify(await jenkins.getTestResults(jobFullName, buildNumber))),
  );

  registerTool(
    "get_build_change_sets",
    "Retrieve SCM change sets for a build.",
    { jobFullName: z.string(), buildNumber: z.string() },
    async ({ jobFullName, buildNumber }) =>
      toContent(stringify(await jenkins.getBuildChangeSets(jobFullName, buildNumber))),
  );

  registerTool(
    "get_job_scm",
    "Retrieve SCM configuration from job definition.",
    { jobFullName: z.string() },
    async ({ jobFullName }) => toContent(stringify(await jenkins.getJobScm(jobFullName))),
  );

  registerTool(
    "get_build_scm",
    "Retrieve SCM metadata for a build.",
    { jobFullName: z.string(), buildNumber: z.string() },
    async ({ jobFullName, buildNumber }) =>
      toContent(stringify(await jenkins.getBuildScm(jobFullName, buildNumber))),
  );

  registerTool(
    "search_build_log",
    "Search a build log with regex-like pattern.",
    {
      jobFullName: z.string(),
      buildNumber: z.string(),
      pattern: z.string(),
      maxMatches: z.number().optional(),
    },
    async ({ jobFullName, buildNumber, pattern, maxMatches }) =>
      toContent(stringify(await jenkins.searchBuildLog(jobFullName, buildNumber, pattern, maxMatches ?? 50))),
  );

  registerTool(
    "find_jobs_with_scm_url",
    "Find jobs referencing a given SCM URL fragment (recursive folders).",
    { scmUrlPart: z.string(), folder: z.string().optional() },
    async ({ scmUrlPart, folder }) => toContent(stringify(await jenkins.findJobsWithScmUrl(scmUrlPart, folder))),
  );

  registerTool(
    "rebuild_build",
    "Rebuild a previous build (same parameters when supported).",
    { jobFullName: z.string(), buildNumber: z.string() },
    async ({ jobFullName, buildNumber }) =>
      toContent(stringify(await jenkins.rebuildBuild(jobFullName, buildNumber))),
  );

  registerTool(
    "get_replay_scripts",
    "Get replay metadata and job config preview for a Pipeline build.",
    { jobFullName: z.string(), buildNumber: z.string() },
    async ({ jobFullName, buildNumber }) =>
      toContent(stringify(await jenkins.getReplayScripts(jobFullName, buildNumber))),
  );

  registerTool(
    "replay_build",
    "Replay a Pipeline build with modified script.",
    {
      jobFullName: z.string(),
      buildNumber: z.string(),
      mainScript: z.string(),
      loadedScripts: z.record(z.string()).optional(),
    },
    async ({ jobFullName, buildNumber, mainScript, loadedScripts }) =>
      toContent(stringify(await jenkins.replayBuild(jobFullName, buildNumber, mainScript, loadedScripts))),
  );

  registerTool(
    "download_artifact",
    "Download a build artifact (base64, size-capped).",
    {
      jobFullName: z.string(),
      buildNumber: z.string(),
      artifactPath: z.string(),
      maxBytes: z.number().optional(),
    },
    async ({ jobFullName, buildNumber, artifactPath, maxBytes }) =>
      toContent(stringify(await jenkins.downloadArtifact(jobFullName, buildNumber, artifactPath, maxBytes))),
  );

  registerTool(
    "enable_job",
    "Enable a Jenkins job.",
    { jobFullName: z.string() },
    async ({ jobFullName }) => toContent(`HTTP ${await jenkins.enableJob(jobFullName)}`),
  );

  registerTool(
    "disable_job",
    "Disable a Jenkins job.",
    { jobFullName: z.string() },
    async ({ jobFullName }) => toContent(`HTTP ${await jenkins.disableJob(jobFullName)}`),
  );

  registerTool(
    "get_build_log",
    "Read full or tail/sliced build console log.",
    {
      jobFullName: z.string(),
      buildNumber: z.string(),
      start: z.number().optional(),
      limit: z.number().optional(),
      tail: z.number().optional(),
    },
    async ({ jobFullName, buildNumber, start, limit, tail }) =>
      toContent(stringify(await jenkins.getBuildLog(jobFullName, buildNumber, start ?? 0, limit, tail))),
  );

  registerTool(
    "create_or_update_pipeline",
    "Create or update a pipeline job from Jenkinsfile script.",
    {
      jobFullName: z.string(),
      script: z.string(),
      sandbox: z.boolean().optional(),
      createIfMissing: z.boolean().optional(),
      folder: z.string().optional(),
    },
    async ({ jobFullName, script, sandbox, createIfMissing, folder }) => {
      const xml = pipelineConfigXml(script, sandbox ?? true);
      try {
        await jenkins.updateJobConfig(jobFullName, xml);
        return toContent("Pipeline config updated.");
      } catch {
        if (!createIfMissing) {
          throw new Error("Pipeline update failed. Set createIfMissing=true to create.");
        }
        const parts = jobFullName.split("/").filter(Boolean);
        const name = parts.pop();
        if (!name) throw new Error("Invalid jobFullName");
        const targetFolder = folder ?? (parts.length > 0 ? parts.join("/") : undefined);
        await jenkins.createJob(name, xml, targetFolder);
        return toContent("Pipeline job created.");
      }
    },
  );

  registerTool(
    "run_script_console",
    "Run Groovy in Jenkins script console (dangerous, optional).",
    { script: z.string() },
    async ({ script }) => toContent(await jenkins.runScriptConsole(script)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
