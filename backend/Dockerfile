FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /app

COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline

COPY . .
RUN mvn -q -DskipTests compile dependency:copy-dependencies

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /app/target/classes ./target/classes
COPY --from=build /app/target/dependency ./target/dependency
COPY --from=build /app/sql ./sql

ENV PORT=8788
ENV HOST=0.0.0.0
EXPOSE 8788

CMD ["java","-cp","target/classes:target/dependency/*","gilberto.Main"]
