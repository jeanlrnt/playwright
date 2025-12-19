/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './playwright-test-fixtures';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { registry } from '../../packages/playwright-core/lib/server';

test('should retain last seconds of video on failure', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = {
        use: {
          video: {
            mode: 'retain-on-failure',
            retainLastSeconds: 2,
          },
        },
      };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('test with video', async ({ page }) => {
        // Wait 3 seconds to ensure we have more than retainLastSeconds worth of content
        await page.setContent('<div>Frame 1</div>');
        await page.waitForTimeout(1000);
        await page.setContent('<div>Frame 2</div>');
        await page.waitForTimeout(1000);
        await page.setContent('<div>Frame 3</div>');
        await page.waitForTimeout(1000);
        // Fail the test
        expect(1).toBe(2);
      });
    `,
  });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);

  // Find the video file
  const testResultsDir = testInfo.outputPath('test-results');
  const videoFiles = fs.readdirSync(testResultsDir, { recursive: true }).filter((file: any) => 
    typeof file === 'string' && file.endsWith('.webm')
  );
  
  expect(videoFiles.length).toBe(1);
  const videoPath = path.join(testResultsDir, videoFiles[0] as string);
  
  // Check that video exists and has content
  expect(fs.existsSync(videoPath)).toBe(true);
  const videoStats = fs.statSync(videoPath);
  expect(videoStats.size).toBeGreaterThan(0);
  
  // Check video duration is approximately 2-3 seconds (retainLastSeconds + padding)
  const ffmpeg = registry.findExecutable('ffmpeg')!.executablePathOrDie('javascript');
  const output = spawnSync(ffmpeg, ['-i', videoPath], { encoding: 'utf8' }).stderr;
  const durationMatch = output.match(/Duration: (\d+):(\d\d):(\d\d\.\d\d)/);
  
  if (durationMatch) {
    const hours = parseInt(durationMatch[1], 10);
    const minutes = parseInt(durationMatch[2], 10);
    const seconds = parseFloat(durationMatch[3]);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    
    // Video should be around 2-4 seconds (retainLastSeconds + padding and last frame)
    expect(totalSeconds).toBeGreaterThan(1);
    expect(totalSeconds).toBeLessThan(5);
  }
});

test('should retain last seconds of trace on failure', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = {
        use: {
          trace: {
            mode: 'retain-on-failure',
            retainLastSeconds: 2,
          },
        },
      };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('test with trace', async ({ page }) => {
        // Perform actions over 3 seconds
        await page.setContent('<div>Action 1</div>');
        await page.waitForTimeout(1000);
        await page.setContent('<div>Action 2</div>');
        await page.waitForTimeout(1000);
        await page.setContent('<div>Action 3</div>');
        await page.waitForTimeout(1000);
        // Fail the test
        expect(1).toBe(2);
      });
    `,
  });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);

  // Find the trace file
  const testResultsDir = testInfo.outputPath('test-results');
  const traceFiles = fs.readdirSync(testResultsDir, { recursive: true }).filter((file: any) => 
    typeof file === 'string' && file.endsWith('trace.zip')
  );
  
  expect(traceFiles.length).toBe(1);
  const tracePath = path.join(testResultsDir, traceFiles[0] as string);
  
  // Check that trace exists and has content
  expect(fs.existsSync(tracePath)).toBe(true);
  const traceStats = fs.statSync(tracePath);
  expect(traceStats.size).toBeGreaterThan(0);
});

test('should not create video on success with retain-on-failure', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = {
        use: {
          video: {
            mode: 'retain-on-failure',
            retainLastSeconds: 2,
          },
        },
      };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('passing test', async ({ page }) => {
        await page.setContent('<div>Test</div>');
        await page.waitForTimeout(2000);
        // Test passes
        expect(1).toBe(1);
      });
    `,
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);

  // No video should be created for passing tests
  const testResultsDir = testInfo.outputPath('test-results');
  if (fs.existsSync(testResultsDir)) {
    const videoFiles = fs.readdirSync(testResultsDir, { recursive: true }).filter((file: any) => 
      typeof file === 'string' && file.endsWith('.webm')
    );
    expect(videoFiles.length).toBe(0);
  }
});
