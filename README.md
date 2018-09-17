# TFTP Server

You want to serve files using the Trivial File Transfer Protocol? Well, then this module might be the one you are looking for.

## API

```js
const TFTP = require('tftp-server');
```

### Method: createServer()

```js
const srv = TFTP.createServer([socketType]);
```

Creates a new TFTP server and returns an instance of ```TFTPServer```. By default ```socketType``` is ```'udp6'```. In most cases this also listens for IPv4 connections using the dual-stack capabilities of your kernel. But you also can avoid IPv6 by specifying ```'udp4'``` as ```socketType```.

### Class: TFTPServer

Don't instantiate this class directly. You should use the factory function ```TFTP.createServer()```.

#### Method: register()

```js
const handle = srv.register([filter, ]handler);
```

Registers a new request handler.

The optional ```filter``` can be a string or a regular expression. The handler will only be called if the filter matches. If filter is omitted, the handler will be called on every request.

The ```handler``` is a function with the following interface: ```(req, res, next) => {...}```. The parameters:
 - ```req```: An object describing the current request:
   - ```req.filename```: The requested file name. This comes in handy if filter is omitted or a regular expression.
   - ```req.mode```: The stated transmission mode.
 - ```res```: A function that awaits a ```Buffer``` as the first argument. If it is called, the buffer is transmitted to the client. No other handlers will be called.
 - ```next```: A function that takes an optional argument. If the argument is an instance of ```Error```, an ERROR packet is sent to the client. If the argument is omitted, the next registered handler is called.

If no matching handler is found that called ```res```, a *"File not found"* error is sent to the client.

#### Method: unregister()

```js
srv.unregister(handle);
```

This removes the handler addressed by the given ```handle```.

#### Method: bind()

```js
srv.bind(options);
```

Binds the server. For further details about ```options``` please have a look into the [Node.js API docs for UDP/Datagram](https://nodejs.org/dist/latest-v8.x/docs/api/dgram.html#dgram_socket_bind_options_callback).

#### Method: destroy()

```js
srv.destroy([cb]);
```

Closes all connections and sockets.
