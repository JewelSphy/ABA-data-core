package gilberto;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;

public final class Db {

  public static Connection open () throws Exception {
    return DriverManager.getConnection ( Env.DB_URL, Env.DB_USER, Env.DB_PASS );
  }

  public static void initSchema () {
    String sql = readSql ( "sql/schema/001_init.sql" );
    if ( sql == null ) {
      throw new IllegalStateException ( "Missing sql/schema/001_init.sql" );
    }
    try ( Connection c = open (); Statement st = c.createStatement () ) {
      for ( String part : sql.split ( ";" ) ) {
        String stmt = part == null ? "" : part.strip ();
        if ( stmt.isEmpty () ) continue;
        st.execute ( stmt );
      }
    } catch ( Exception e ) {
      throw new IllegalStateException ( "Schema init failed: " + e.getMessage (), e );
    }
  }

  public static String readSql ( String rel ) {
    try {
      return Files.readString ( Path.of ( rel ), StandardCharsets.UTF_8 );
    } catch ( Exception e ) {
      return null;
    }
  }

  private Db () {}
}
