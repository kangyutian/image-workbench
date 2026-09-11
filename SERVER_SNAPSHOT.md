# Server snapshot before video remix deployment

- Source path: `/home/ubuntu/image-workbench`
- Server: `VM-0-13-ubuntu`
- Captured from the live server before deploying the video remix production matrix.
- Remote archive: `/home/ubuntu/image-workbench-backups/image-workbench-pre-video-remix-20260911-231234.tar.gz`
- Archive SHA-256: `82d506c43c141bda2b40195f83618ea7be25e286c950c8b57a276e11c583ea7e`
- Service state at capture: `image-workbench.service` active.

The snapshot contains the server application source and built `dist` output. It intentionally excludes `.env`, `.env.*`, `data`, `node_modules`, `.git`, and deployment archives. Runtime secrets and persistent user data remain on the server and are not committed to GitHub.
