/*jshint browser: true, jquery: true, devel: true */
/*global Backbone: false, sag: false _: false*/

/**
 * Modelled after Andrzej Sliwa's connector (https://github.com/andrzejsliwa/backbone-couch)
 * but refactored to use sag.js for connections, play better with Cloudant specific services
 * and updated to latest (at time of writing) backbone version.
 *
 * MIT License tbc.
 **/

(function(){
  'use strict';

  if (typeof Backbone === 'undefined') {
    new Error("Missing / not loaded backbone.js !!");
  }

  if (typeof sag === 'undefined') {
    new Error("Missing / not loaded sag.js !!");
  }

  var default_db = {
    server : window.location.hostname,
    port : window.location.port,
    protocol: window.location.protocol.replace(':', ''),
    // define database name
    name :  window.location.pathname.split('/_design/')[0].replace('/', ''),
    // define base url
    prefix : ''
  };

  Backbone.sag = {
    // enable / disable handling changes
    enableChangesFeed: true,
    // define database server - default to params from location where possible
    database: default_db,
    // list of collections to keep track
    _watchList : {},

    /**
     * show / suppress logger information depends from debug option
     *
     * @param message - string message
     *
     * TODO: debug/warn/error levels
     **/
    log: function ( message ) {
      if ( this.debug && console && console.log ) {
        console.log( "Backbone.sag - ", message );
      }
    },

    // turn on/off logger
    debug: false,

    /**
     * "connect" to a database
     *
     * @param override_db - override the global db parameters for the operation
     * @return sag server instance
     * @type Object
     **/
    db: function(override_db){
      var sagdb;
      var db_params = {};
      _.extend(db_params, this.database, override_db);
      this.log('connecting to ' + db_params.prefix + db_params.name  + ' on ' + db_params.server);
      // FIXME: Get this working with a username/password...
      // function(host, port, user, pass, protocol)
      sagdb = sag.server(db_params.server, db_params.port, '', '', db_params.protocol);
      if (db_params.prefix !== "") sagdb.setPathPrefix(db_params.prefix);
      return sagdb.setDatabase(db_params.name);
    },

    /**
     * Fetch a collection from an index (all_docs, view or search)
     *
     * @param collection - the collection object
     * @param _success - function, optional function to fire when request completes
     * @param _error - function, optional function to fire when request fails
     **/
    fetchCollection: function( collection, options ) {
      // TODO: decide on whether to require 2 params in the collection or have a single url
      var url = _.isFunction( collection.url ) ? collection.url() : collection.url;
      var query = {};
      var db = this.db(collection.db);
      var request = db.get;
      if( collection.design ){
        // If there's a design the _url will just be the view name, so build a full url
        url = '/_design/' + collection.design + '/_view/' + url;
      }
      if (collection.couchdb){
        _.each(collection.couchdb, function(value, key){
          if (_.isFunction(value)) collection.couchdb[key] = value();
        });
        // The collection has parameters to pass into the view
        if (collection.couchdb.keys) {
          // Needs to POST
          request = db.post;
          query.data = {keys: collection.couchdb.keys};
          delete collection.couchdb.keys;
        }
        url += '?' + $.param(collection.couchdb);
      }
      //
      query.url = url;
      // Use a provided callback if one is given, otherwise try to return rows
      query.callback = function(resp, success) {
        if (success) {
          // TODO: Pass the full response object into collection.success?
          options.success((collection.success || function( result ) {
            return result;
          })(resp.body.rows));
        } else {
          return (collection.error || options.error)();
        }
      };
      return request(query);
    }
  };

  // Modelled after Andrzej Sliwa's sync, but updated
  Backbone.sync = function( method, obj, options ) {
    var deferred;
    var db = Backbone.sag.db();
    if ( method === "create" || method === "update" ) {
      // triggered on "model.save(...)"
      console.log('create/update');
      console.log(obj);
      deferred = db.put({id: obj.id,
        data: obj.toJSON(),
        callback: function(resp, success){
          if (success){
            options.success(resp.body);
          } else {
            options.error(resp.body);
          }
        }
      });
      //Backbone.sag.create( obj, success, error );
    } else if ( method === "delete" ) {
      // triggered on "model.destroy(...)"
      console.log('delete');
      deferred = db.delete(obj.id,
        obj.get('_rev'),
        function(resp, success){
          if (success){
            options.success(resp.body);
          } else {
            options.error(resp.body);
          }
        });

      //Backbone.couch.remove( obj, success, error );
    } else if ( method === "read" ) {
      // depends from where sync is called
      if ( obj.model ) {
        // triggered on "collection.fetch(...)"
        deferred = Backbone.sag.fetchCollection( obj, options );
      } else {
        // triggered on "model.fetch(...)"
        deferred = db.get({url: obj.id,
          callback: function(resp, success){
          if (success){
            options.success(resp.body);
          } else {
            options.error(resp.body);
          }
        }});
      }
    }
    return deferred;
    // TODO: changes feed handler
  };
})();
