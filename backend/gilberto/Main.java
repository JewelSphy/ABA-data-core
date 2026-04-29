package gilberto;

import com.sun.net.httpserver.HttpServer;
import gilberto.handlers.ClientsHandler;
import gilberto.handlers.CaregiversHandler;
import gilberto.handlers.HealthHandler;
import gilberto.handlers.SessionsHandler;
import gilberto.handlers.SessionNotesHandler;
import gilberto.handlers.StaffHandler;
import gilberto.handlers.StatsHandler;
import gilberto.handlers.AiNoteHandler;
import java.net.InetSocketAddress;

public final class Main {

  public static final int PORT = Env.intOrDefault ( "PORT", 8788 );

  public static void main ( String[] args ) throws Exception {
    Db.initSchema ();
    if ( !Env.hasApiKey () ) {
      System.out.println ( "[security] API_KEY not set: running without API-key auth guard." );
    }
    if ( "*".equals ( Env.ALLOWED_ORIGIN ) ) {
      System.out.println ( "[security] ALLOWED_ORIGIN=* : consider setting a fixed frontend origin." );
    }

    HttpServer server = HttpServer.create ( new InetSocketAddress ( "127.0.0.1", PORT ), 0 );
    server.createContext ( "/health",             new HealthHandler ()   );
    server.createContext ( "/api/clients",        new ClientsHandler ()  );
    server.createContext ( "/api/caregivers",     new CaregiversHandler () );
    server.createContext ( "/api/staff",          new StaffHandler ()    );
    server.createContext ( "/api/sessions",       new SessionsHandler () );
    server.createContext ( "/api/session-notes",  new SessionNotesHandler () );
    server.createContext ( "/api/ai/session-note",new AiNoteHandler () );
    server.createContext ( "/api/client-stats",   new StatsHandler.ClientStatsHandler () );
    server.createContext ( "/api/dashboard-stats",new StatsHandler.DashboardStatsHandler () );
    server.setExecutor ( null );
    server.start ();

    System.out.println ( "Gilberto backend running on http://127.0.0.1:" + PORT );
  }
}
