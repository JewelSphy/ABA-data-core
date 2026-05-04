package gilberto;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
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
      ensureCaregiverColumns ( c );
      ensureDocumentColumns ( c );
    } catch ( Exception e ) {
      throw new IllegalStateException ( "Schema init failed: " + e.getMessage (), e );
    }
  }

  private static String currentSchema ( Connection c ) throws Exception {
    try ( Statement s = c.createStatement (); ResultSet rs = s.executeQuery ( "SELECT DATABASE()" ) ) {
      if ( !rs.next () ) return "";
      String db = rs.getString ( 1 );
      return db == null ? "" : db;
    }
  }

  /** True when the column is absent (or schema name could not be resolved). */
  private static boolean columnMissing ( Connection c, String table, String column ) throws Exception {
    String schema = currentSchema ( c );
    if ( schema.isEmpty () ) return true;
    String q =
        "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
    try ( PreparedStatement ps = c.prepareStatement ( q ) ) {
      ps.setString ( 1, schema );
      ps.setString ( 2, table );
      ps.setString ( 3, column );
      try ( ResultSet rs = ps.executeQuery () ) {
        return !rs.next ();
      }
    }
  }

  /**
   * Adds a column when missing. Uses plain {@code ALTER TABLE … ADD COLUMN} so MySQL/MariaDB versions
   * without {@code IF NOT EXISTS} still migrate; {@code ADD COLUMN IF NOT EXISTS} was failing silently
   * in try/catch on older engines.
   */
  private static void addColumnIfMissing ( Connection c, String table, String column, String typeAndNull ) {
    try {
      if ( !columnMissing ( c, table, column ) ) return;
      try ( Statement st = c.createStatement () ) {
        st.execute ( "ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + typeAndNull );
      }
    } catch ( Exception e ) {
      System.err.println ( "[gilberto] Could not add column " + table + "." + column + ": " + e.getMessage () );
    }
  }

  private static void ensureCaregiverColumns ( Connection c ) {
    addColumnIfMissing ( c, "caregivers", "client_id", "VARCHAR(36) NULL" );
    addColumnIfMissing ( c, "caregivers", "notes", "TEXT NULL" );
  }

  private static void ensureDocumentColumns ( Connection c ) {
    addColumnIfMissing ( c, "documents", "client_id", "VARCHAR(36) NULL" );
    addColumnIfMissing ( c, "documents", "requirement_key", "VARCHAR(80) NULL" );
    try ( Statement st = c.createStatement () ) {
      st.execute ( "ALTER TABLE documents ADD INDEX idx_documents_client (client_id)" );
    } catch ( Exception ignored ) {
      /* duplicate index name or engine limitation */
    }
    addColumnIfMissing ( c, "documents", "attachment_mime", "VARCHAR(120) NULL" );
    addColumnIfMissing ( c, "documents", "attachment_filename", "VARCHAR(255) NULL" );
    addColumnIfMissing ( c, "documents", "attachment_base64", "LONGTEXT NULL" );
    addColumnIfMissing ( c, "documents", "content_text", "LONGTEXT NULL" );
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
