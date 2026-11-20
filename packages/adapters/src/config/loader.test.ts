import { describe, it, expect } from 'vitest';
import { loadAppConfig } from './loader.js';

describe('AppConfig Loader Suite', () => {
  it('loads valid default application configuration', () => {
    const config = loadAppConfig({
      NODE_ENV: 'test',
      MODEL_PROVIDER: 'fake',
    });

    expect(config.env).toBe('test');
    expect(config.model.provider).toBe('fake');
    expect(config.college.id).toBe('sdi');
    expect(config.server.port).toBe(3000);
    expect(config.canvas.useFakeCourseData).toBe(true);
  });

  it('customizes demo personas and canvas config from environment variables', () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      DEMO_STUDENT_ID: 'student_999',
      DEMO_INSTRUCTOR_ID: 'instructor_888',
      DEMO_TA_ID: 'ta_777',
      CANVAS_USE_FAKE_COURSE_DATA: 'false',
      PORT: '8080',
      HOST: '127.0.0.1',
      CORS_ORIGINS: 'https://classroom.sdi.edu,https://sdi.edu',
      DEMO_PASSWORD: 'secret-passcode',
      DEMO_INVITED_EMAILS: 'evaluator@sdi.edu, tester@sdi.edu',
    });

    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.server.corsOrigins).toEqual(['https://classroom.sdi.edu', 'https://sdi.edu']);
    expect(config.canvas.useFakeCourseData).toBe(false);

    const student = config.canvas.demoPersonas.find((p) => p.id === 'demo_student');
    expect(student?.canvasUserId).toBe('student_999');

    const instructor = config.canvas.demoPersonas.find((p) => p.id === 'demo_instructor');
    expect(instructor?.canvasUserId).toBe('instructor_888');

    const ta = config.canvas.demoPersonas.find((p) => p.id === 'demo_ta');
    expect(ta?.canvasUserId).toBe('ta_777');

    expect(config.demoAuth.enabled).toBe(true);
    expect(config.demoAuth.password).toBe('secret-passcode');
    expect(config.demoAuth.invitedEmails).toEqual(['evaluator@sdi.edu', 'tester@sdi.edu']);
  });

  it('loads postgres persistenceMode, Cloudflare Access JWKS settings, and crisisAlert webhook config', () => {
    const pgConfig = loadAppConfig({
      NODE_ENV: 'test',
      PERSISTENCE_MODE: 'postgres',
      CF_ACCESS_TEAM_DOMAIN: 'sdi-demo.cloudflareaccess.com',
      CF_ACCESS_AUD: 'aud-hex-123',
      CRISIS_WEBHOOK_URL: 'https://alerts.sdi.edu/hook',
      CRISIS_ALERT_BEARER_TOKEN: 'bearer-xyz',
    });

    expect(pgConfig.database.persistenceMode).toBe('postgres');
    expect(pgConfig.demoAuth.cfAccessTeamDomain).toBe('sdi-demo.cloudflareaccess.com');
    expect(pgConfig.demoAuth.cfAccessAud).toBe('aud-hex-123');
    expect(pgConfig.crisisAlert?.webhookUrl).toBe('https://alerts.sdi.edu/hook');
    expect(pgConfig.crisisAlert?.bearerToken).toBe('bearer-xyz');

    const altConfig = loadAppConfig({
      USE_POSTGRES: 'true',
      CRISIS_ALERT_WEBHOOK_URL: 'https://primary-alerts.sdi.edu/hook',
    });
    expect(altConfig.database.persistenceMode).toBe('postgres');
    expect(altConfig.crisisAlert?.webhookUrl).toBe('https://primary-alerts.sdi.edu/hook');
  });

  it('throws fatal error when environment configuration fails schema validation', () => {
    expect(() => {
      loadAppConfig({
        PORT: 'not-a-number',
      });
    }).toThrow('Fatal: Invalid Application Configuration');
  });
});
