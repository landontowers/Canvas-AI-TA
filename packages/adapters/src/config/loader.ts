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

  const demoPersonas = SDI_DEMO_PERSONAS.map((p) => {
    if (p.id === 'demo_student' && env.DEMO_STUDENT_ID) {
      return { ...p, canvasUserId: env.DEMO_STUDENT_ID.trim() };
    }
    if (p.id === 'demo_instructor' && env.DEMO_INSTRUCTOR_ID) {
      return { ...p, canvasUserId: env.DEMO_INSTRUCTOR_ID.trim() };
    }
    if (p.id === 'demo_ta' && env.DEMO_TA_ID) {
      return { ...p, canvasUserId: env.DEMO_TA_ID.trim() };
    }
    return p;
  });

  const useFakeCourseData =
    env.CANVAS_USE_FAKE_COURSE_DATA !== undefined
      ? env.CANVAS_USE_FAKE_COURSE_DATA === 'true' || env.CANVAS_USE_FAKE_COURSE_DATA === '1'
      : true;

  const persistenceMode: 'memory' | 'postgres' =
    env.PERSISTENCE_MODE === 'postgres' || env.USE_POSTGRES === 'true' ? 'postgres' : 'memory';

  const crisisWebhookUrl =
    (env.CRISIS_ALERT_WEBHOOK_URL || env.CRISIS_WEBHOOK_URL)?.trim() || undefined;
  const crisisBearerToken = env.CRISIS_ALERT_BEARER_TOKEN?.trim() || undefined;

  const rawConfig = {
    env: env.NODE_ENV || 'development',
    server: {
      port: env.PORT ? parseInt(env.PORT, 10) : 3000,
      host: env.HOST || '0.0.0.0',
      corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : ['*'],
    },
    database: {
      url: env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_tutor',
      persistenceMode,
    },
    canvas: {
      baseUrl: env.CANVAS_BASE_URL || 'https://classroom.sdi.edu',
      accessToken: env.CANVAS_ACCESS_TOKEN || 'mock-dev-token',
      demoPersonas,
      useFakeCourseData,
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
      cfAccessTeamDomain: env.CF_ACCESS_TEAM_DOMAIN?.trim() || undefined,
      cfAccessAud: env.CF_ACCESS_AUD?.trim() || undefined,
    },
    crisisAlert:
      crisisWebhookUrl || crisisBearerToken
        ? {
            webhookUrl: crisisWebhookUrl,
            bearerToken: crisisBearerToken,
          }
        : undefined,
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
