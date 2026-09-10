import OS from "os"
import cluster, { Cluster } from "cluster"
import { app, port } from "."
import {
    FR_migrateFrom_oldDB,
    migrateSpotDB,
    spotFuture_migrateFrom_oldDB,
    spotFuture_migrateTypeTxsFrom_oldDB,
} from "./database"

if (require.main === module) {
    if (cluster.isPrimary) {
        console.log(`INFO -- Master process ${process} is running.`)
        console.log(`INFO -- Available cores:  ${OS.cpus().length}`)

        for (let i = 0; i < (OS.cpus.length / 2 > 0 ? OS.cpus.length / 2 : 1); i++) {
            cluster.fork()
        }
    } else {
        console.log(`INFO -- Worker ${process.pid} has started.`)
        app.listen(port, async () => {
            console.log(`[server]: Server is running at http://localhost:${port}`)

            // NOTE: database migrations are NOT run on boot. They are a manual,
            // local, admin-only operation performed with the server stopped:
            //   pnpm --dir backend migrate:latest             # dry run
            //   pnpm --dir backend migrate:latest -- --apply  # writes + safety copies
            // See scripts/migrate-latest-dbs.ts. (Uploading a DB through the
            // admin UI and triggering this server-side is future work.)
        })
    }
}
