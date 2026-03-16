import { createApp } from "./app";
import { appConfig } from "./config";

const app = createApp();

app.listen(appConfig.port, () => {
  console.log(`Zerodha backend listening on http://localhost:${appConfig.port}`);
});
