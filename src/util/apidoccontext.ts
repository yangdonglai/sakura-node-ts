// Copyright 2018 Frank Lin (lin.xiaoe.f@gmail.com). All rights reserved.
// Use of this source code is governed a license that can be found in the LICENSE file.

import * as fs from "fs";

import {ApiDescription, ApiDoc} from "../base/apidoc";
import {isNumber} from "util";


/**
 * API document context
 */
export class ApiDocContext {

  /**
   * Generating unit test to path
   */
  static generateUnitTests(params: {host?: string, docs: ApiDoc[], path: string}): void {
    const copyright: string = "// Copyright Gago Group. All rights reserved.\n" +
      "// Use of this source code is governed a license that can be found in the LICENSE file.\n" +
      "//\n" +
      "// The unit test is generated by sakura-node-ts (https://github.com/DaYeSquad/sakura-node-ts)\n\n";
    const importStatement: string = `import * as supertest from "supertest";\nimport * as chai from "chai";\n\n`;

    for (let doc of params.docs) {
      let content: string = copyright + importStatement;

      content += `describe("Test ${doc.groupName} API", () => {\n\n`;

      for (let apiDescription of doc.descriptions) {
        content += `  it("${apiDescription.description}", (done: MochaDone) => {\n`;

        if (apiDescription.requestBody) {
          content += `    const request: any = ${JSON.stringify(apiDescription.requestBody, null, 2)};\n`.replace(/\n\r?/g, "\n    ");
          content += "\n";
        }

        if (params.host) {
          content += `    supertest("${params.host}")\n`;
        } else {
          content += `    supertest(url)\n`;
        }

        let uri: string = `      .${apiDescription.method.toLowerCase()}("${apiDescription.uri}")\n`;
        if (apiDescription.queryParameters) {
          for (let queryParameter of apiDescription.queryParameters) {
            uri = uri.replace(`{${queryParameter.key}}`, queryParameter.example);
          }
        }

        content += uri; // replace parameters

        if (apiDescription.requestHeaders) {
          for (let key in apiDescription.requestHeaders) {
            content += `      .set("${key}", "${apiDescription.requestHeaders[key]}")\n`;
          }
        }

        if (apiDescription.requestBody) {
          content += `      .send(JSON.stringify(request))\n`;
        }

        content += `      .expect((res: supertest.Response) => {\n`;

        let responseBodyChai: string = this.responseBodyToChaiExpect_(apiDescription.responseBody);
        if (apiDescription.additionalConditions && apiDescription.additionalConditions.length > 0) {
          for (let condition of apiDescription.additionalConditions) {
            const paths: string[] = condition.keyPath.split("/");
            let jsonPath: string = "";
            let lastJsonKey: string = "";
            let maybeValue: any = apiDescription.responseBody;
            for (let path of paths) {
              if (!isNaN(Number(path))) { // array index
                jsonPath += `[${path}]`;
              } else { // object key
                jsonPath += `["${path}"]`;
              }

              maybeValue = maybeValue[path];
              lastJsonKey = path;
            }

            const originalStr: string = `chai.expect(res${jsonPath}).to.equal(${maybeValue});`;

            if (condition.type === "ValueEqual") {
              // it's default, just pass
            } else if (condition.type === "KeyExist") {
              const jsonPathWithoutLastKey: string = jsonPath.replace(`["${lastJsonKey}"]`, "");
              responseBodyChai = responseBodyChai.replace(originalStr,
                `chai.expect(res${jsonPathWithoutLastKey}).to.have.property("${lastJsonKey}");`);
            } else if (condition.type === "Ignore") {
              responseBodyChai = responseBodyChai.replace(originalStr, "");
            } else if (condition.type === "ValueRange") {
              responseBodyChai = responseBodyChai.replace(originalStr,
                `chai.expect(res${jsonPath}).to.greaterThan(${condition.valueRange[0]}).and.lessThan(${condition.valueRange[1]});`);
            } else {
              throw new Error("Unknown type");
            }
          }
        }
        content += responseBodyChai;

        content += `      })\n`;
        content += `      .expect(200, done);\n`;
        content += `  });\n\n`;
      }

      content += "});";

      fs.writeFileSync(`${params.path}/test-${doc.groupName.toLowerCase()}-controller.ts`, content);
    }
  }

  static generateBlueprintDocument(params: {host: string, docs: ApiDoc[]}): string {
    let content: string = `FORMAT: 1A\nHOST: ${params.host}\n\n`;

    for (let doc of params.docs) {
      content += `# Group ${doc.groupName}\n\n`;

      for (let apiDescription of doc.descriptions) {
        content += `## ${apiDescription.description} [${apiDescription.uri}]\n\n`;
        content += `### ${apiDescription.detailDescription ? apiDescription.detailDescription : apiDescription.description} [${apiDescription.method}]\n\n`;

        if (apiDescription.queryParameters) {
          content += `${this.queryParametersToString_(apiDescription)}`;
        }

        if (apiDescription.requestBody) {
          content += `${this.requestBodyToString_(apiDescription.requestBody)}`;
          content += `\n\n`;
        }

        if (apiDescription.responseBody) {
          content += `${this.responseBodyToString_(apiDescription.responseBody)}`;
        }

        content += "\n\n";
      }
    }

    return content;
  }

  /**
   * Return part of description like below
   *
   * + Parameters
        + id: 10 (number, required) - 猪体长列表吐出去的 objectId
        + type: `length` (string, required) - length or weight
   */
  private static queryParametersToString_(doc: ApiDescription): string {
    let content: string = "";
    content += `+ Parameters\n\n`;

    for (let queryParameter of doc.queryParameters) {
      let isRequiredString: string = queryParameter.type;

      if (queryParameter.type.endsWith("?")) {
        isRequiredString = `(${queryParameter.type.slice(0, -1)}, optional)`;
      } else {
        isRequiredString = `(${queryParameter.type}, required)`;
      }

      content += `    + ${queryParameter.key}: ${queryParameter.example} ${isRequiredString} - ${queryParameter.description}\n\n`;
    }

    return content;
  }

  private static requestBodyToString_(requestBody: any): string {
    let content: string = "";
    content += `+ Request (application/json)\n\n`;
    content += `    + Body\n\n`;
    content += `            ${JSON.stringify(requestBody, null, 4)}\n\n`.replace(/\n\r?/g, "\n            ");
    content = content.slice(0, -26); // remove unused line
    return content;
  }

  private static responseBodyToString_(responseBody: any): string {
    let content: string = "";
    content += `+ Response 200 (application/json)\n\n`;
    content += `    + Body\n\n`;
    content += `            ${JSON.stringify(responseBody, null, 4)}\n\n`.replace(/\n\r?/g, "\n            ");
    content = content.slice(0, -26); // remove unused line
    return content;
  }

  private static responseBodyToChaiExpect_(responseBody: any, stack?: string): string {
    let content: string = "";
    if (!stack) {
      stack = "";
    } else { // responseBody may already being a primitives
      if (typeof responseBody === "boolean" ||
          typeof responseBody === "number" ||
          typeof responseBody === "string" ||
          typeof responseBody === "undefined") {
        content += `        chai.expect(res${stack}).to.equal(${responseBody});\n`;
        return content;
      }
    }

    for (let property in responseBody) {
      if (responseBody.hasOwnProperty(property)) {
        if (Array.isArray(responseBody[property])) {
          stack += `["${property}"]`;
          for (let i = 0; i < responseBody[property].length; i++) {
            let iStack = `${stack}[${i}]`;
            content += this.responseBodyToChaiExpect_(responseBody[property][i], iStack);
          }
        } else if (typeof responseBody[property] === "object") {
          stack += `["${property}"]`;
          content += this.responseBodyToChaiExpect_(responseBody[property], stack);
        } else {
          let value: any = responseBody[property];
          if (typeof value === "string") {
            value = `"${value}"`;
          }

          if (stack !== "") {
            content += `        chai.expect(res${stack}["${property}"]).to.equal(${value});\n`;
          } else {
            content += `        chai.expect(res["${property}"]).to.equal(${value});\n`;
          }
        }
      }
    }

    return content;
  }
}
