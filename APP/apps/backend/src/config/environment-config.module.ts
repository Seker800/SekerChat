import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        HOST: Joi.string().hostname().default('0.0.0.0'),
        PORT: Joi.number().default(3000),
        APP_BASE_URL: Joi.string().uri().required(),
        API_BASE_URL: Joi.string().uri().required(),
        CORS_ORIGINS: Joi.string().allow('').optional(),
        TRUSTED_PROXY_CIDRS: Joi.string().allow('').optional(),
        DATABASE_URL: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().min(12).required(),
        JWT_REFRESH_SECRET: Joi.string().min(12).required(),
        JWT_ACCESS_TTL: Joi.string().required(),
        JWT_REFRESH_TTL: Joi.string().required(),
        OIDC_ISSUER: Joi.string().uri().allow('').optional(),
        OIDC_CLIENT_ID: Joi.string().allow('').optional(),
        OIDC_CLIENT_SECRET: Joi.string().allow('').optional(),
        OIDC_REDIRECT_URI: Joi.string().uri().allow('').optional(),
        OIDC_SCOPES: Joi.string().default('openid profile email'),
        ADMIN_EMAILS: Joi.string().allow('').default(''),
        BOOTSTRAP_SUPER_ADMIN_EMAIL: Joi.string().email().allow('').optional(),
        S3_ENDPOINT: Joi.string().uri().required(),
        S3_PUBLIC_ENDPOINT: Joi.string().uri().allow('').optional(),
        S3_REGION: Joi.string().required(),
        S3_BUCKET: Joi.string().required(),
        S3_ACCESS_KEY_ID: Joi.string().required(),
        S3_SECRET_ACCESS_KEY: Joi.string().required(),
        S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(true),
        FILE_ACCESS_SECRET: Joi.string().min(12).required(),
        FILE_ACCESS_TTL: Joi.string().required(),
        HEIF_CONVERT_PATH: Joi.string().default('heif-convert'),
        HEIF_INFO_PATH: Joi.string().default('heif-info'),
      }),
    }),
  ],
})
export class EnvironmentConfigModule {}
