
(function(){

  var ipc = require('electron').ipcRenderer;
  var ipcSend = ipc.send;
  var sliced = function(args,start,end){ return Array.prototype.slice.call(args,start,end)};
  var instanceId;
  var remote = require('electron').remote;


// Listen for error events
  window.addEventListener('error', function(e) {
    send('page', 'error', e.message, e.error.stack);
  });

  // prevent 'unload' and 'beforeunload' from being bound
  var defaultAddEventListener = window.addEventListener;
  window.addEventListener = function (type) {
    if (type === 'unload' || type === 'beforeunload') {
      return;
    }
    defaultAddEventListener.apply(window, arguments);
  };

  // prevent 'onunload' and 'onbeforeunload' from being set
  Object.defineProperties(window, {
    onunload: {
      enumerable: true,
      writable: false,
      value: null
    },
    onbeforeunload: {
      enumerable: true,
      writable: false,
      value: null
    }
  });

  // listen for console.log
  var defaultLog = console.log;
  var defaultTrace = console.trace;
  console.log = function() {
    send('console', 'log', sliced(arguments));
    return defaultLog.apply(this, arguments);
  };

  // listen for console.warn
  var defaultWarn = console.warn;
  console.warn = function() {
    send('console', 'warn', sliced(arguments));
    return defaultWarn.apply(this, arguments);
  };

  // listen for console.error
  var defaultError = console.error;
  console.error = function() {
    send('console', 'error', sliced(arguments));
    return defaultError.apply(this, arguments);
  };

  // overwrite the default alert
  window.alert = function(message){
    send('page', 'alert', message);
  };

  // overwrite the default prompt
  window.prompt = function(message, defaultResponse){
    send('page', 'prompt', message, defaultResponse);
  }

  // overwrite the default confirm
  window.confirm = function(message, defaultResponse){
    send('page', 'confirm', message, defaultResponse);
  }

  ipc.on('javascript',function(event,js_fn,args) {
    try
    {
      var fn = eval('(' + js_fn + ')');
      var response;

      if(fn.length - 1 == args.length) {
        args.push(((err, v) => {
          defaultLog('callback response',err,v);
          if(err) {
            send('error', err.message || err.toString());
          }
          send('response', v);
        }));
        fn.apply(null, args);
      }
      else {
        response = fn.apply(null, args);
        if(response && response.then) {
          response.then((v) => {
            send('response', v);
          })
            .catch((err) => {
              send('error', err)
            });
        } else {
          send('response', response);
        }
      }
    }
    catch (err) {
      defaultError('error',err);
      send('error', err.message);
    }
  });

  ipc.on('init',function(event,opts)
  {
    defaultLog('on init')
    init(opts);
  });

  var haveInit = false;
  function init(opts)
  {
    if (haveInit)
    {
      send('init-received');
      return;
    }

    haveInit = true;
    defaultLog('init',opts);
    instanceId = opts.instanceId;
    if (opts.sendToHost) {
      ipcSend = ipc.sendToHost;
    }
    if (opts.executeJavaScriptSecure)
      delete window.__nightmare;



    if(opts.initFn && opts.initFn != 'undefined' && opts.initFn != 'null')
    {
      try {
        var fn = eval('(' + opts.initFn + ')');
        fn.apply(null)
      }
      catch(err)
      {
        console.log('error',err);
      }
    }

    send('init-received');
  };

  function send(name)
  {
    // Support multiple instances
    name = 'nightmare:' + instanceId + ':' + name;
    defaultLog('send',name,arguments);
    var args = Array.prototype.slice.call(arguments,1);
    ipcSend.apply(ipcSend,[name].concat(args));

  }

  // May be deleted later
  window.__nightmare = {};
  __nightmare.ipc = { send: send};
  __nightmare.sliced = sliced;

  var webContents = remote.getCurrentWebContents();
  var a = webContents.preload && webContents.preload();
  if (a)
    init(a);
  else
    webContents.on('init',(event,opts) => { init(opts)})

})()
