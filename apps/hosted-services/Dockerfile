# syntax=docker/dockerfile:1.7

FROM composer:2.7 AS vendor
WORKDIR /app
COPY composer.json composer.lock* ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --optimize-autoloader

FROM php:8.2-fpm-alpine AS runtime

RUN apk add --no-cache nginx supervisor postgresql-libs icu-libs \
    && apk add --no-cache --virtual .build-deps postgresql-dev icu-dev $PHPIZE_DEPS \
    && docker-php-ext-install pdo_pgsql intl opcache \
    && apk del .build-deps

WORKDIR /var/www/html

COPY --from=vendor /app/vendor ./vendor
COPY . .

RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app storage bootstrap/cache 2>/dev/null || true

ENV APP_ENV=production \
    LOG_CHANNEL=json \
    PHP_OPCACHE_VALIDATE_TIMESTAMPS=0

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/api/v1/health || exit 1

CMD ["php", "-S", "0.0.0.0:8080", "-t", "public"]
