import { z } from 'zod';
import { CourseSettingValueSchema } from '../types/course.js';

export const ThemeTokensSchema = z.object({
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  primaryActionColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontBody: z.string(),
  fontDisplay: z.string(),
});

export const CrisisResourcesSchema = z.object({
  hotlineName: z.string(),
  phone: z.string(),
  sms: z.string().optional(),
  url: z.string().url(),
  message: z.string(),
});

export const DemoPersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  canvasUserId: z.string(),
  role: z.enum(['student', 'instructor']),
  description: z.string(),
});

export const DemoAuthConfigSchema = z.object({
  enabled: z.boolean().default(false),
  password: z.string().optional(),
  invitedEmails: z.array(z.string()).default([]),
});

export const CollegeConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  ltiIssuer: z.string().optional(),
  defaultCourseSetting: CourseSettingValueSchema.default('full'),
  theme: ThemeTokensSchema,
  crisis: CrisisResourcesSchema,
  personaCopy: z.object({
    tutorName: z.string(),
    greetingStudent: z.string(),
    greetingInstructor: z.string(),
  }),
});

export const AppConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  server: z.object({
    port: z.number().int().positive().default(3000),
    host: z.string().default('0.0.0.0'),
    corsOrigins: z.array(z.string()).default(['*']),
  }),
  database: z.object({
    url: z.string().url(),
  }),
  canvas: z.object({
    baseUrl: z.string().url(),
    accessToken: z.string().min(1),
    demoPersonas: z.array(DemoPersonaSchema).default([]),
    useFakeCourseData: z.boolean().default(true),
  }),
  model: z.object({
    provider: z.enum(['fake', 'gemini', 'azure-openai']).default('fake'),
    apiKey: z.string().optional(),
    studentModel: z.string().default('gemini-3.8-flash'),
    instructorModel: z.string().default('gemini-3.8-flash'),
    classifierModel: z.string().default('gemini-3.8-flash'),
  }),
  demoAuth: DemoAuthConfigSchema.default({
    enabled: false,
    invitedEmails: [],
  }),
  college: CollegeConfigSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type DemoAuthConfig = z.infer<typeof DemoAuthConfigSchema>;
export type CollegeConfig = z.infer<typeof CollegeConfigSchema>;
export type DemoPersona = z.infer<typeof DemoPersonaSchema>;
