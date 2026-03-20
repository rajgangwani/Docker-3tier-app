FROM nginx:1.25-alpine AS builder
WORKDIR /build
COPY index.html .

FROM nginx:1.25-alpine

RUN apk add --no-cache gettext \
    && rm -f /etc/nginx/conf.d/default.conf

COPY --from=builder /build/index.html /usr/share/nginx/html/index.html
COPY nginx.conf.template /etc/nginx/nginx.conf.template

EXPOSE 8080

CMD ["/bin/sh", "-c", "envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
