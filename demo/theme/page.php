<?php
/**
 * The template for displaying all pages
 *
 * @package Handoff
 * @since 1.0.0
 */

get_header();
?>

<main id="main" class="site-main o-container" role="main">
    <div class="o-row">
        <div class="o-col-12">

            <?php
            while (have_posts()) :
                the_post();

                get_template_part('template-parts/content', 'page');

                // If comments are open or we have at least one comment, load up the comment template
                if (comments_open() || get_comments_number()) :
                    comments_template();
                endif;

            endwhile;
            ?>

        </div>
    </div>
</main><!-- #main -->

<?php
get_footer();



