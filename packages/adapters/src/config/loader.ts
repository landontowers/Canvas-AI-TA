import { AppConfig, AppConfigSchema } from '@ai-tutor/core';
import { SDI_COLLEGE_CONFIG, SDI_DEMO_PERSONAS } from './sdi.config.js';

export function loadAppConfig(customEnv?: NodeJS.ProcessEnv): AppConfig {
  if (!customEnv) {
    if (typeof process !== 'undefined' && typeof process.loadEnvFile === 'function') {
      try {
        process.loadEnvFile();
      } catch {
        try {
          process.loadEnvFile('../.env');
        } catch {
          // Ignore if .env is missing
        }
      }
    }
  }
  const env = customEnv || process.env;
  const rawConfig = {
    env: env.NODE_ENV || 'development',
    server: {
      port: env.PORT ? parseInt(env.PORT, 10) : 3000,
      host: env.HOST || '0.0.0.0',
      corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : ['*'],
    },
    database: {
      url: env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_tutor',
    },
    canvas: {
      baseUrl: env.CANVAS_BASE_URL || 'https://classroom.sdi.edu',
      accessToken: env.CANVAS_ACCESS_TOKEN || 'mock-dev-token',
      demoPersonas: SDI_DEMO_PERSONAS,
    },
    model: {
      provider: (env.MODEL_PROVIDER as 'fake' | 'gemini' | 'azure-openai') || 'fake',
      apiKey: env.GEMINI_API_KEY || env.AZURE_OPENAI_API_KEY,
      studentModel: env.STUDENT_MODEL || 'gemini-3.8-flash',
      instructorModel: env.INSTRUCTOR_MODEL || 'gemini-3.8-flash',
      classifierModel: env.CLASSIFIER_MODEL || 'gemini-3.8-flash',
    },
    demoAuth: {
      enabled: env.DEMO_AUTH_ENABLED === 'true' || Boolean(env.DEMO_PASSWORD),
      password: env.DEMO_PASSWORD,
      invitedEmails: env.DEMO_INVITED_EMAILS
        ? env.DEMO_INVITED_EMAILS.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
        : [],
    },
    college: SDI_COLLEGE_CONFIG,
  };

  const parsed = AppConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i: { path: (string | number)[]; message: string }) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Fatal: Invalid Application Configuration:\n${errorDetails}`);
  }

  return parsed.data;
}
