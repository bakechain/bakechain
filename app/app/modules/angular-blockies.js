angular.module('angular-blockies', [])
  .directive('blocky', function($compile) {

    function link(scope, element, attrs) {
      
      function buildBlock() {
        var icon = blockies.create({
          seed: attrs.seed,
          size: attrs.size,
          scale: attrs.scale,
          spotcolor: '#000'
        });

        var compiled = $compile(icon)(scope);
        element.replaceWith(compiled);
        element = compiled;
      }

      // watch all the attributes within a single $watch
      scope.$watch(function() {
        return [attrs.seed, attrs.color, attrs.bgcolor, attrs.size, attrs.scale];
      }, buildBlock, true);

    };

    return {
      restrict: 'EA',
      replace: false,
      link: link
    };
  });