declare module 'socket.io-client' {
  const io: (uri?: string, opts?: Record<string, unknown>) => any;
  export default io;
}
