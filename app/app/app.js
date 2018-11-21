"use strict";
var app = angular.module('bakechain', [
  'ngRoute',
  'angular-blockies',
  'oitozero.ngSweetAlert'
])
.run(function($rootScope, Lang) {
  $rootScope.translate = Lang.translate;
})
app.config(function($routeProvider, $compileProvider) {
  $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|local|data|chrome-extension|moz-extension|file):/);
  $routeProvider
  .when("/new", {
      templateUrl : "app/views/new.html",
      controller : "NewController",
  })
  .when("/create", {
      templateUrl : "app/views/create.html",
      controller : "CreateController",
  })
  .when("/restore", {
      templateUrl : "app/views/restore.html",
      controller : "RestoreController",
  })
  .when("/link", {
    templateUrl : "app/views/link.html",
    controller : "LinkController",
  })
  .when("/validate", {
      templateUrl : "app/views/validate.html",
      controller : "ValidateController",
  })
  .when("/encrypt", {
      templateUrl : "app/views/encrypt.html",
      controller : "EncryptController",
  })
  .when("/main", {
      templateUrl : "app/views/main.html",
      controller : "MainController",
  })
  .when("/unlock", {
      templateUrl : "app/views/unlock.html",
      controller : "UnlockController",
  })
  .when("/setting", {
      templateUrl : "app/views/setting.html",
      controller : "SettingController",
  })
  .otherwise({
      redirectTo: '/new'
  });
})
.directive('tooltip', function(){
  return {
    restrict: 'A',
    link: function(scope, element, attrs){
      element.hover(function(){
        element.tooltip('show');
      }, function(){
        element.tooltip('hide');
      });
    }
  };
})
.directive('numberSelect', function() {
  return {
    require: 'ngModel',
    link: function(scope, element, attrs, ngModel) {
      ngModel.$parsers.push(function(val) {
        return val != null ? parseFloat(val, 10) : null;
      });
      ngModel.$formatters.push(function(val) {
        return val != null ? '' + val : null;
      });
    }
  };
});