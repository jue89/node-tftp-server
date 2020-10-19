declare module 'tftp-server' {
    import dgram from "dgram";

    export interface Request {
        filename: string;
        mode: "netascii" | "octet" | "mail"
    }
    export type Response = (buf: Buffer) => void
    export type Handler = (req: Request, res: Response, next: () => void) => void
    export type Handle = number
    
    export class TFTPServer {
        constructor(type: dgram.SocketType)
        bind(options?: dgram.BindOptions): void
        register(filter: string | RegExp, handler: Handler): Handle
        register(handler: Handler): Handle
        unregiser(handle: Handle): void
        destroy(cb?: Function): void
    }

    export function createServer(type: dgram.SocketType = 'udp6'): TFTPServer
    export function serveStatic (dir: string): Handler
}
