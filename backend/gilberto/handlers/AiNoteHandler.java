package gilberto.handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import gilberto.Audit;
import gilberto.HttpUtil;
import gilberto.JsonUtil;
import java.io.IOException;

public final class AiNoteHandler implements HttpHandler {
  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "ai_note", null, "denied" ); return; }
    if ( !"POST".equalsIgnoreCase ( ex.getRequestMethod () ) ) {
      HttpUtil.err ( ex, 405, "Method not allowed" );
      return;
    }

    String b = HttpUtil.body ( ex );
    String client = safe ( JsonUtil.field ( b, "client_name" ), "the client" );
    String service = safe ( JsonUtil.field ( b, "service_type" ), "behavior treatment" ).replace ( "_", " " );
    String date = safe ( JsonUtil.field ( b, "session_date" ), "today" );
    String start = safe ( JsonUtil.field ( b, "start_time" ), "scheduled start time" );
    String end = safe ( JsonUtil.field ( b, "end_time" ), "scheduled end time" );
    String mood = safe ( JsonUtil.field ( b, "client_mood" ), "calm" );
    String participation = safe ( JsonUtil.field ( b, "participation" ), "partial participation" );
    String env = safe ( JsonUtil.field ( b, "environmental_changes" ), "No major environmental changes were reported." );
    String provider = safe ( JsonUtil.field ( b, "provider_name" ), "provider" );

    String note =
      "On " + date + ", " + provider + " conducted a " + service + " session with " + client
      + " from " + start + " to " + end + ". "
      + client + " presented with a " + mood + " mood and demonstrated " + participation + ". "
      + env + " "
      + "Interventions were implemented according to the treatment plan, data was collected throughout the session, "
      + "and progress toward current goals was monitored. Continued consistency with the current plan is recommended.";

    Audit.log ( ex, "generate", "ai_note", JsonUtil.field ( b, "session_id" ), "success" );
    HttpUtil.json ( ex, 200, "{\"note\":" + JsonUtil.strOrNull ( note ) + "}" );
  }

  private String safe ( String v, String fallback ) {
    return JsonUtil.blank ( v ) ? fallback : v;
  }
}
