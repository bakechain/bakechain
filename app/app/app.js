"use strict";
var app = angular.module('bakechain', [
  'ngRoute',
  'angular-blockies'
])
app.config(function($routeProvider) {
    $routeProvider
    .when("/create", {
        templateUrl : "app/views/create.html",
        controller : "CreateController",
    })
    .when("/unlock", {
        templateUrl : "app/views/unlock.html",
        controller : "UnlockController",
    })
    .when("/new", {
        templateUrl : "app/views/new.html",
        controller : "NewController",
    })
    .when("/password", {
        templateUrl : "app/views/password.html",
        controller : "PasswordController",
    })
    .when("/restore", {
        templateUrl : "app/views/restore.html",
        controller : "RestoreController",
    })
    .when("/main", {
        templateUrl : "app/views/main.html",
        controller : "MainController",
    })
    .when("/validate", {
        templateUrl : "app/views/validate.html",
        controller : "ValidateController",
    })
    .otherwise({
        redirectTo: '/new'
    });
});