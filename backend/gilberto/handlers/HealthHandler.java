package gilberto.handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import gilberto.HttpUtil;
import java.io.IOException;

public final class HealthHandler implements HttpHandler {
  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !"GET".equalsIgnoreCase ( ex.getRequestMethod () ) ) { HttpUtil.err ( ex, 405, "Method not allowed" ); return; }
    HttpUtil.json ( ex, 200, "{\"ok\":true}" );
  }
}
