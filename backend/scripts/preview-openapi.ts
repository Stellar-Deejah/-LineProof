import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../src/openapi.js';

const app = express();
app.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: 'LineProof API Documentation',
  }),
);

const port = Number(process.env.OPENAPI_PREVIEW_PORT ?? 4100);
app.listen(port, () => {
  console.log(`LineProof Swagger UI available at http://127.0.0.1:${port}`);
});
