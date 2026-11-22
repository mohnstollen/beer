package io.github.mohnstollen.beer;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Native HTTP-Anfragen für die WebDAV-Synchronisation (Nextcloud).
 *
 * Läuft außerhalb der WebView, daher gelten keine CORS-Regeln. OkHttp unterstützt beliebige
 * Methoden wie MKCOL oder PROPFIND, die HttpURLConnection ablehnt.
 *
 * JS: WebDav.request({ url, method, headers, bodyBase64 }) → { status, headers, bodyBase64 }
 */
@CapacitorPlugin(name = "WebDav")
public class WebDavPlugin extends Plugin {

    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .build();

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        String method = call.getString("method", "GET").toUpperCase();
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Ungültige URL");
            return;
        }
        executor.execute(() -> {
            try {
                Request.Builder builder = new Request.Builder().url(url);
                String contentType = null;
                JSObject headers = call.getObject("headers", new JSObject());
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    String value = headers.getString(key);
                    if (value == null) continue;
                    if ("content-type".equalsIgnoreCase(key)) contentType = value;
                    builder.header(key, value);
                }

                RequestBody body = null;
                String bodyBase64 = call.getString("bodyBase64");
                if (bodyBase64 != null) {
                    byte[] bytes = Base64.decode(bodyBase64, Base64.NO_WRAP);
                    body = RequestBody.create(bytes, contentType != null ? MediaType.parse(contentType) : null);
                } else if ("PUT".equals(method) || "POST".equals(method)) {
                    body = RequestBody.create(new byte[0], null);
                }
                builder.method(method, body);

                try (Response response = client.newCall(builder.build()).execute()) {
                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    JSObject outHeaders = new JSObject();
                    for (String name : response.headers().names()) {
                        outHeaders.put(name.toLowerCase(), response.header(name));
                    }
                    result.put("headers", outHeaders);
                    ResponseBody responseBody = response.body();
                    byte[] data = responseBody != null ? responseBody.bytes() : new byte[0];
                    result.put("bodyBase64", Base64.encodeToString(data, Base64.NO_WRAP));
                    call.resolve(result);
                }
            } catch (IOException e) {
                call.reject("Netzwerkfehler: " + e.getMessage(), "NETWORK", e);
            } catch (Exception e) {
                call.reject("Fehler: " + e.getMessage(), "ERROR", e);
            }
        });
    }
}
